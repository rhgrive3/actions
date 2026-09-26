#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 2) {
    out[argv[index].replace(/^--/, '')] = argv[index + 1];
  }
  return out;
}

function hex(value) {
  try { return '0x' + BigInt(value).toString(16); } catch { return null; }
}

function jsonScalar(value) {
  return typeof value === 'bigint' ? value.toString() : (value ?? null);
}

function parseAddress(line) {
  const match = /^\s*([0-9a-f]+):\s+([a-z][\w.]*)\s*(.*)$/i.exec(line);
  if (!match) return null;
  return {
    address: BigInt('0x' + match[1]),
    mnemonic: match[2].toLowerCase(),
    opStr: match[3].replace(/\s*\/\/.*$/, '').trim(),
  };
}

function disassemble(symbolName, binary) {
  const result = spawnSync('llvm-objdump', [
    '--disassemble-symbols=' + symbolName,
    '--no-show-raw-insn',
    binary,
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 15000 });
  if (result.status !== 0) return null;
  const instructions = (result.stdout || '').split(/\r?\n/).map(parseAddress).filter(Boolean);
  return instructions.length > 0 && instructions.length <= 700 ? instructions : null;
}

const WIDTH_ONLY_CATEGORIES = new Set(['int8', 'int16', 'int32', 'int64']);

/**
 * Hex marks these claims `widthOnly: true`: the access proves the width but not
 * the C type (reports/phase7/cxx-recovery/README.md), so the label is a hedge
 * over every type of that width and never an assertion that it is *not* a
 * class instance, typedef or bool.
 */
function isWidthOnlyClaim(claim) {
  return WIDTH_ONLY_CATEGORIES.has(claim.category) && (claim.signedness ?? null) == null;
}

/**
 * Kind verdict of one Hex claim against one DWARF type, ignoring width (the
 * width is judged separately by `claimTypeVerdict`).
 *  - 'match'     DWARF's kind is one of the alternatives the claim itself allows.
 *  - 'unproven'  the claim proves only a width, or DWARF declares a composite
 *                (class/struct/union/typedef-of-either) that carries no scalar kind.
 *  - 'mismatch'  DWARF's definitive kind contradicts a kind Hex proved.
 *  - 'unknown'   DWARF type unresolved or the claim carries no type.
 */
function claimKindVerdict(claim, type) {
  const category = claim.category ?? null;
  if (!category || !type || type.category === 'unknown') return 'unknown';
  const dwarfCategory = type.category;
  const size = Number(type.sizeBytes ?? 0);
  const width = Number(claim.sizeBytes ?? 0);
  // A composite type declares no scalar kind of its own, so it can neither
  // confirm nor contradict a kind claim; only its extent decides below.
  if (dwarfCategory === 'aggregate') return 'unproven';
  switch (category) {
    case 'pointer':
      return dwarfCategory === 'pointer' && size === 8 ? 'match' : 'mismatch';
    case 'float':
      return dwarfCategory === 'float' && size === 4 ? 'match' : 'mismatch';
    case 'double':
      return dwarfCategory === 'float' && size === 8 ? 'match' : 'mismatch';
    case 'bool-like':
      return size === 1 && (dwarfCategory === 'boolean' || dwarfCategory === 'integer') ? 'match' : 'mismatch';
    case 'array-like':
      return dwarfCategory === 'array' ? 'match' : 'mismatch';
    default: {
      const widthMatch = /^int(8|16|32|64)$/.exec(category);
      if (!widthMatch) return 'unknown';
      const provesKind = !isWidthOnlyClaim(claim);
      const scalarInt = (dwarfCategory === 'integer' || dwarfCategory === 'enum');
      if (!scalarInt) {
        if (provesKind) return 'mismatch';
        // The 8-byte width-only label lists `pointer` as one of its own
        // alternatives, so DWARF pointer confirms it rather than hedging past it.
        if (dwarfCategory === 'pointer' && size === 8 && width === 8) return 'match';
        return 'unproven';
      }
      if (provesKind) {
        if (size !== Number(widthMatch[1]) / 8) return 'mismatch';
        if (claim.signedness != null && type.signedness != null && claim.signedness !== type.signedness) return 'mismatch';
        return 'match';
      }
      if (size === width) return 'match';
      return 'unproven';
    }
  }
}

const CLAIM_RANK = { contradicted: 0, unknown: 1, notConfirmed: 2, confirmed: 3 };

function bestVerdict(verdicts) {
  return verdicts.reduce((best, verdict) => (CLAIM_RANK[verdict] > CLAIM_RANK[best] ? verdict : best), 'contradicted');
}

/**
 * One Hex member claim against one same-build DWARF member.
 *  - 'confirmed'    kind confirmed by DWARF and byte extents agree.
 *  - 'notConfirmed' no contradiction, but DWARF does not confirm Hex's label
 *                   (width-only hedge, composite type, or a DWARF member wider
 *                   than the access Hex saw).
 *  - 'contradicted' DWARF disproves something Hex proved: the member is narrower
 *                   than Hex's access width, or a proven kind disagrees.
 *  - 'unknown'      no resolvable DWARF type or width for the comparison.
 */
function claimTypeVerdict(claim, member) {
  const type = member?.type ?? null;
  if (!type || type.category === 'unknown' || type.sizeBytes == null) return 'unknown';
  const dwarfSize = Number(type.sizeBytes);
  const hexSize = Number(claim.sizeBytes ?? 0);
  if (!Number.isSafeInteger(dwarfSize) || dwarfSize <= 0) return 'unknown';
  if (!Number.isSafeInteger(hexSize) || hexSize <= 0) return 'unknown';
  const kind = claimKindVerdict(claim, type);
  if (kind === 'unknown') return 'unknown';
  if (kind === 'mismatch') return 'contradicted';
  // Hex's field extent is the access width: a DWARF member that ends inside it
  // means Hex's field boundary overruns the real member.
  if (dwarfSize < hexSize) return 'contradicted';
  if (dwarfSize > hexSize) return 'notConfirmed';
  return kind === 'match' ? 'confirmed' : 'notConfirmed';
}

/**
 * Project judged claim groups into the reported metrics: the member-existence
 * verdict the holdout gates on, the separate type verdict, every disagreement
 * with its address and DWARF truth, and a confirmed-member pseudocode sample.
 */
function summariseJudgement(rows, claimRecords) {
  const confirmedMembers = rows.filter((row) => row.status === 'confirmed');
  const contradictedMembers = rows.filter((row) => row.status === 'contradicted');
  const unknownMembers = rows.filter((row) => row.status === 'unknown');
  const memberMetrics = {
    claimed: rows.length,
    confirmed: confirmedMembers.length,
    contradicted: contradictedMembers.length,
    unknown: unknownMembers.length,
    claimRecords,
    distinctClasses: new Set(rows.map((row) => row.className).filter(Boolean)).size,
  };
  const countType = (status) => rows.filter((row) => row.typeStatus === status).length;
  const typeMetrics = {
    judged: rows.length - countType('unknown'),
    confirmed: countType('confirmed'),
    notConfirmed: countType('notConfirmed'),
    contradicted: countType('contradicted'),
    unknown: countType('unknown'),
  };
  const claimShape = (row) => row.hexClaims.map((claim) => ({
    typeLabel: claim.typeLabel,
    category: claim.category,
    widthOnly: isWidthOnlyClaim(claim),
    sizeBytes: claim.sizeBytes,
    rule: claim.rule,
    pseudocodeLines: claim.pseudocodeLines,
  }));
  const location = (row) => ({
    address: row.hexClaims[0]?.functionAddress ?? null,
    function: row.hexClaims[0]?.symbol ?? null,
    className: row.className,
    memberOffsetBytes: row.offsetBytes,
  });
  const contradictions = contradictedMembers.map((row) => ({
    ...location(row),
    claim: claimShape(row),
    dwarfTruth: row.dwarfTruth,
  }));
  const typeDisagreements = rows
    .filter((row) => row.typeStatus === 'notConfirmed' || row.typeStatus === 'contradicted')
    .map((row) => ({
      ...location(row),
      verdict: row.typeStatus,
      claim: claimShape(row),
      dwarfTruth: row.dwarfTruth,
    }));
  // The sample must be a member DWARF confirmed *and* one Hex actually rendered
  // with `this->` lines, so the holdout can show names and pseudocode together.
  // Prefer a member whose type DWARF confirmed too.
  const withLines = (row) => row.hexClaims.some((claim) => claim.pseudocodeLines.length);
  const sampleMember = confirmedMembers.find((row) => row.typeStatus === 'confirmed' && withLines(row))
    ?? confirmedMembers.find(withLines)
    ?? null;
  const sampleClaim = sampleMember?.hexClaims.find((claim) => claim.pseudocodeLines.length) ?? null;
  const sampleDwarfMembers = sampleMember
    ? (Array.isArray(sampleMember.dwarfTruth) ? sampleMember.dwarfTruth : [sampleMember.dwarfTruth])
      .filter((row) => row && typeof row === 'object')
    : [];
  const sampleDwarfNames = sampleDwarfMembers.map((member) => member.name).filter(Boolean);
  const sampleDwarfTypeLabels = [...new Set(sampleDwarfMembers.map((member) => member.type?.name || member.type?.category).filter(Boolean))];
  const samplePseudocode = sampleClaim ? {
    className: sampleMember.className,
    offsetBytes: sampleMember.offsetBytes,
    dwarfMember: sampleMember.dwarfTruth,
    address: sampleClaim.functionAddress,
    function: sampleClaim.symbol,
    hexType: sampleClaim.typeLabel,
    lines: sampleClaim.pseudocodeLines,
    dwarfMemberNames: sampleDwarfNames,
    dwarfTypeLabels: sampleDwarfTypeLabels,
    pseudocodeWithDwarfNames: sampleClaim.pseudocodeLines.map((line) =>
      line + ' // DWARF same-build match: ' + sampleMember.className + '::' +
        (sampleDwarfNames.join(' / ') || '<unnamed member>') +
        (sampleDwarfTypeLabels.length ? ' (' + sampleDwarfTypeLabels.join(' / ') + ')' : '')),
  } : null;
  return {
    memberMetrics,
    typeMetrics,
    contradictions,
    typeDisagreements,
    sampleMember,
    samplePseudocode,
    sampleDwarfNames,
    sampleDwarfTypeLabels,
  };
}

function writeReport(report, outPath) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outPath), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    variant: report.variant,
    provider: report.provider,
    candidateCount: report.candidateCount,
    analyzedFunctions: report.analyzedFunctions,
    classMetrics: report.classMetrics,
    memberMetrics: report.memberMetrics,
    typeMetrics: report.typeMetrics,
    sample: report.samplePseudocode ? {
      className: report.samplePseudocode.className,
      offsetBytes: report.samplePseudocode.offsetBytes,
      address: report.samplePseudocode.address,
      function: report.samplePseudocode.function,
    } : null,
  }, null, 2));
}

const args = argsOf(process.argv.slice(2));
const requiredKeys = args['from-report'] ? ['oracle', 'out'] : ['target-root', 'binary', 'oracle', 'out', 'variant'];
for (const key of requiredKeys) {
  if (!args[key]) throw new Error('missing-' + key);
}
const targetRoot = args['target-root'] ? path.resolve(args['target-root']) : null;
const binary = args.binary ? path.resolve(args.binary) : null;
const oracle = JSON.parse(fs.readFileSync(args.oracle, 'utf8'));
if (oracle.schema !== 'cxx-dwarf-oracle/v1') throw new Error('unexpected-dwarf-oracle-schema');
const dwarfClasses = new Map(oracle.classes.map((item) => [item.className, item]));

// Re-judge a stored report against the same oracle without re-running Hex, so
// verdict-logic changes can be verified locally in seconds instead of paying
// for a full CI cycle. The denominator (every stored claim) is unchanged.
if (args['from-report']) {
  const prior = JSON.parse(fs.readFileSync(path.resolve(args['from-report']), 'utf8'));
  const rows = (prior.memberResults || []).map((row) => judgeGroup(row.className ?? null, row.offsetBytes, row.hexClaims || []));
  const claimRecords = prior.memberMetrics?.claimRecords
    ?? rows.reduce((total, row) => total + row.hexClaims.length, 0);
  const summary = summariseJudgement(rows, claimRecords);
  writeReport({
    ...prior,
    schema: 'hex-cxx-debug-holdout/v2',
    rejudgedFrom: path.resolve(args['from-report']),
    oracleBuildId: oracle.buildId,
    memberMetrics: summary.memberMetrics,
    typeMetrics: summary.typeMetrics,
    memberResults: rows,
    contradictions: summary.contradictions,
    typeDisagreements: summary.typeDisagreements,
    samplePseudocode: summary.samplePseudocode,
  }, args.out);
  process.exit(0);
}

const [{ openBinary }, { SymbolIndex }, { createCxxEvidenceProvider }, { parseOperands }, { analyzeSemanticFunction }] = await Promise.all([
  import(pathToFileURL(path.join(targetRoot, 'js/binary/index.js')).href),
  import(pathToFileURL(path.join(targetRoot, 'js/symbols.js')).href),
  import(pathToFileURL(path.join(targetRoot, 'js/analysis/cxx/project.js')).href),
  import(pathToFileURL(path.join(targetRoot, 'js/arm64.js')).href),
  import(pathToFileURL(path.join(targetRoot, 'js/analysis/semantic-function.js')).href),
]);

const bytes = fs.readFileSync(binary);
const image = openBinary(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
const rawSymbols = image.symbols || [];
const addressableSymbols = rawSymbols.filter((symbol) => symbol.address != null);
const symbols = new SymbolIndex({
  addrs: addressableSymbols.map((symbol) => symbol.address),
  names: addressableSymbols.map((symbol) => symbol.name),
  kinds: addressableSymbols.map(() => 0),
  flags: addressableSymbols.map(() => 0),
});
const symbolNamesAt = new Map();
for (const symbol of rawSymbols) {
  if (symbol.address == null || typeof symbol.name !== 'string' || !symbol.name) continue;
  const key = BigInt(symbol.address).toString();
  const names = symbolNamesAt.get(key) || [];
  if (!names.includes(symbol.name)) names.push(symbol.name);
  symbolNamesAt.set(key, names);
}
const sizeByAddress = new Map();
for (const symbol of rawSymbols) {
  if (symbol.address == null) continue;
  const key = BigInt(symbol.address).toString();
  if (!sizeByAddress.has(key)) sizeByAddress.set(key, symbol.size ?? null);
}
const read = async (address, length) => {
  const offset = image.addressToOffset?.(address);
  if (offset == null) return null;
  const start = Number(offset), size = Number(length);
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(size) || size <= 0 || start >= bytes.length) return null;
  return bytes.subarray(start, Math.min(start + size, bytes.length));
};

const provider = createCxxEvidenceProvider({
  symbols,
  read,
  pointerBytes: 8,
  architecture: 'arm64',
  snapshotId: 'cxx-dwarf-holdout:' + args.variant,
  symbolSizeOf: (address) => sizeByAddress.get(address.toString()) ?? null,
  sectionEndOf: (address) => {
    const section = image.sectionAt?.(address);
    return section?.size == null ? null : section.address + section.size;
  },
  maxClasses: 2500,
  maxSlots: 128,
  maxReads: 50000,
  maxMembers: 256,
});
await provider.build();
const classEvidence = provider.classEvidence();
const dwarfVtables = new Map(oracle.vtableSymbols.map((item) => [item.name, item]));
const classRows = (classEvidence?.classes || []).map((record) => {
  const dwarf = record.className ? dwarfClasses.get(record.className) : null;
  const table = record.vtableSymbol ? dwarfVtables.get(record.vtableSymbol) : null;
  const dwarfMethods = new Map((dwarf?.virtualMethods || [])
    .filter((method) => method.linkageName && method.vtableIndex != null)
    .map((method) => [method.linkageName, method]));
  const slotLayout = [];
  for (const slot of record.slots || []) {
    for (const alias of slot.aliases || []) {
      const method = dwarfMethods.get(alias);
      if (!method) continue;
      slotLayout.push({
        method: method.name,
        linkageName: alias,
        dwarfVtableIndex: method.vtableIndex,
        hexVtableIndex: slot.index,
        targetAddress: hex(slot.address),
        status: method.vtableIndex === slot.index ? 'matched' : 'mismatch',
      });
    }
  }
  return {
    className: record.className,
    nameSource: record.nameSource,
    vtableAddress: hex(record.vtableAddress),
    vtableSymbol: record.vtableSymbol,
    typeinfoAddress: hex(record.typeinfoAddress),
    slotCount: (record.slots || []).length,
    resolvedSlotCount: (record.slots || []).filter((slot) => slot.address != null && !slot.unresolved).length,
    dwarfClassMatched: Boolean(dwarf?.complete),
    dwarfVtableMatched: Boolean(table && BigInt(table.address) === BigInt(record.vtableAddress)),
    dwarfVirtualMethodCount: dwarf?.virtualMethods?.length ?? 0,
    dwarfLayoutComparisons: slotLayout,
    slots: (record.slots || []).map((slot) => ({
      index: slot.index,
      offsetBytes: slot.offset,
      address: hex(slot.address),
      unresolved: slot.unresolved,
      aliases: slot.aliases,
    })),
  };
});

const candidateByAddress = new Map();
for (const record of classEvidence?.classes || []) {
  for (const slot of record.slots || []) {
    if (slot.address == null || slot.unresolved) continue;
    const key = BigInt(slot.address).toString();
    const names = symbolNamesAt.get(key) || [];
    const functionName = names.find((name) => /^_ZN/.test(name));
    if (!functionName) continue;
    const row = candidateByAddress.get(key) || {
      address: BigInt(slot.address),
      name: functionName,
      vtableRefs: [],
    };
    row.vtableRefs.push({
      className: record.className,
      vtableAddress: hex(record.vtableAddress),
      vtableSymbol: record.vtableSymbol,
      slotIndex: slot.index,
    });
    candidateByAddress.set(key, row);
  }
}

const dummyArg = { id: 'arg0', kind: 'arg', reg: 'x0', bits: 64 };
const candidates = [];
for (const candidate of candidateByAddress.values()) {
  const projection = provider.projectForFunction({
    functionId: 'candidate:' + candidate.address,
    functionAddress: candidate.address,
    functionName: candidate.name,
    ir: { values: [dummyArg], instructions: [] },
  });
  if (!projection?.receiver) continue;
  candidate.receiverClass = projection.receiver.classIdentity?.className ?? null;
  candidates.push(candidate);
}
candidates.sort((left, right) => left.address < right.address ? -1 : left.address > right.address ? 1 : left.name.localeCompare(right.name));

const maxFunctions = Number(process.env.CXX_HOLDOUT_MAX_FUNCTIONS || 600);
const analyzed = [];
const failures = [];
const allClaims = [];
for (const candidate of candidates.slice(0, maxFunctions)) {
  const rows = disassemble(candidate.name, binary);
  if (!rows) continue;
  const functionAddress = candidate.address;
  try {
    const result = analyzeSemanticFunction({
      architecture: 'arm64',
      platform: 'linux',
      abiId: 'aapcs64',
      mode: 'a64',
      decoderSemanticVersion: 'cxx-debug-holdout-v1',
      binaryId: 'cxx-holdout-' + args.variant,
      sliceId: 'cxx-holdout-arm64-' + args.variant,
      name: candidate.name,
      instructions: rows.map((row, index) => ({
        address: row.address,
        size: 4,
        length: 4,
        mode: 'a64',
        mnemonic: row.mnemonic,
        opStr: row.opStr,
        ops: parseOperands(row.opStr),
        instructionId: 'cxx-holdout-' + candidate.address + '-' + index,
        origin: { instructionIds: ['cxx-holdout-' + candidate.address + '-' + index] },
      })),
      cxxEvidenceProvider: provider,
    });
    const projection = provider.lastAttempt()?.projection ?? null;
    const code = result.decompiler?.pseudocode ?? '';
    const codeLines = code.split(/\r?\n/).map((line) => line.trim()).filter((line) => /\bthis->/.test(line));
    for (const member of projection?.members || []) {
      const offsetSpelling = Number(member.offsetBytes).toString(16);
      const fieldPattern = new RegExp('this->field_(?:0x)?0*' + offsetSpelling + '(?![0-9a-f])', 'i');
      const claim = {
        functionAddress: hex(functionAddress),
        symbol: candidate.name,
        receiverClass: projection.receiver?.classIdentity?.className ?? null,
        vtableRefs: candidate.vtableRefs,
        virtualSlots: (projection.virtualSlots || []).map((slot) => ({
          callSiteAddress: hex(slot.callSiteAddress),
          slotIndex: jsonScalar(slot.slotIndex),
          slotByteOffset: jsonScalar(slot.slotByteOffset),
          virtualSlotKnown: slot.virtualSlotKnown === true,
        })),
        offsetBytes: Number(member.offsetBytes),
        sizeBytes: member.sizeBytes,
        category: member.category,
        typeLabel: member.typeLabel,
        signedness: member.signedness,
        widthOnly: isWidthOnlyClaim(member),
        categoryCandidates: Array.isArray(member.categoryCandidates) ? [...member.categoryCandidates] : null,
        typeProven: member.typeProven,
        rule: member.rule,
        reason: member.reason,
        pseudocodeLines: codeLines.filter((line) => fieldPattern.test(line)).slice(0, 4),
      };
      allClaims.push(claim);
    }
    analyzed.push({
      address: hex(functionAddress),
      symbol: candidate.name,
      receiverClass: projection?.receiver?.classIdentity?.className ?? candidate.receiverClass,
      vtableRefs: candidate.vtableRefs,
      virtualSlotCount: (projection?.virtualSlots || []).length,
      virtualSlots: (projection?.virtualSlots || []).map((slot) => ({
        callSiteAddress: hex(slot.callSiteAddress),
        slotIndex: jsonScalar(slot.slotIndex),
        slotByteOffset: jsonScalar(slot.slotByteOffset),
        virtualSlotKnown: slot.virtualSlotKnown === true,
      })),
      memberCount: projection?.members?.length ?? 0,
      pseudocodeLines: codeLines.slice(0, 12),
      virtualCallLines: codeLines.filter((line) => /\(\s*\*|\bvirtual\b|\bvtable\b/i.test(line)).slice(0, 6),
      completeness: result.decompiler?.coverage?.completeness ?? null,
    });
  } catch (error) {
    failures.push({ address: hex(functionAddress), symbol: candidate.name, reason: String(error?.message || error).slice(0, 240) });
    if (failures.length > 100) failures.shift();
  }
}

/**
 * Judge one (class, offset) claim group against the same-build DWARF oracle.
 *
 * `status` is the member-existence verdict the holdout gates on: DWARF must
 * carry a DW_TAG_member at exactly this class + byte offset, otherwise the
 * member claim is contradicted (an invented member) or unknown (the class is
 * incomplete / has unresolved inherited layout, so we fail closed).
 * `typeStatus` judges Hex's type and width claim against that same member and
 * is reported separately, so the existence verdict can never mask a type
 * disagreement and a hedged width-only label can never mask an invented member.
 */
function judgeGroup(className, offsetBytes, claims) {
  const dwarf = className ? dwarfClasses.get(className) : null;
  const members = (dwarf?.members || []).filter((member) => member.offsetBytes === offsetBytes);
  let status;
  let truth = null;
  if (!dwarf?.complete) {
    status = 'unknown';
    truth = 'no complete DW_TAG_class_type/structure_type with this exact class name';
  } else if (members.length === 0) {
    if ((dwarf.unresolvedMemberLocations || 0) > 0 || (dwarf.bases || []).length > 0) {
      status = 'unknown';
      truth = 'DWARF has inherited members or unresolved member/base locations; no exact direct member at this offset was established';
    } else {
      status = 'contradicted';
      truth = 'DWARF class ' + className + ' has no data member at byte offset ' + offsetBytes;
    }
  } else {
    status = 'confirmed';
    truth = members.length > 1
      ? members.map((member) => ({
        name: member.name,
        offsetBytes: member.offsetBytes,
        type: member.type,
        declaringClass: member.declaringClass,
      }))
      : {
        name: members[0].name,
        offsetBytes: members[0].offsetBytes,
        type: members[0].type,
        declaringClass: members[0].declaringClass,
      };
  }
  // Overlapping members at one offset: a claim survives when at least one of
  // them confirms it, and only a claim every candidate contradicts is counted
  // as contradicted.
  const verdicts = members.length > 0
    ? claims.map((claim) => bestVerdict(members.map((member) => claimTypeVerdict(claim, member))))
    : [];
  const typeStatus = verdicts.includes('contradicted') ? 'contradicted'
    : verdicts.includes('notConfirmed') ? 'notConfirmed'
      : verdicts.includes('confirmed') ? 'confirmed'
        : 'unknown';
  return {
    className,
    offsetBytes,
    status,
    typeStatus,
    hexClaims: claims,
    dwarfTruth: truth,
  };
}

const claimGroups = new Map();
for (const claim of allClaims) {
  const key = String(claim.receiverClass) + '\u0000' + claim.offsetBytes;
  const group = claimGroups.get(key) || [];
  group.push(claim);
  claimGroups.set(key, group);
}
const memberResults = [];
for (const claims of claimGroups.values()) {
  const first = claims[0];
  memberResults.push(judgeGroup(first.receiverClass, first.offsetBytes, claims));
}

const layoutComparisons = classRows.flatMap((row) => row.dwarfLayoutComparisons);
const vtableLayoutMismatches = layoutComparisons.filter((row) => row.status === 'mismatch');
const classesWithNames = classRows.filter((row) => row.className);
const {
  memberMetrics,
  typeMetrics,
  contradictions,
  typeDisagreements,
  sampleMember,
  samplePseudocode,
  sampleDwarfNames,
  sampleDwarfTypeLabels,
} = summariseJudgement(memberResults, allClaims.length);
const report = {
  schema: 'hex-cxx-debug-holdout/v2',
  variant: args.variant,
  binary: path.basename(binary),
  binaryBytes: bytes.length,
  oracleBinary: oracle.binary,
  oracleBuildId: oracle.buildId,
  symbolCount: rawSymbols.length,
  provider: provider.stats(),
  candidateCount: candidates.length,
  candidateLimit: maxFunctions,
  analyzedFunctions: analyzed.length,
  classMetrics: {
    hexNamedClasses: classesWithNames.length,
    dwarfClassesMatched: classesWithNames.filter((row) => row.dwarfClassMatched).length,
    uniqueHexNamedClasses: new Set(classesWithNames.map((row) => row.className)).size,
    uniqueDwarfClassesMatched: new Set(classesWithNames.filter((row) => row.dwarfClassMatched).map((row) => row.className)).size,
    hexVtables: classRows.filter((row) => row.vtableAddress != null).length,
    dwarfVtablesMatched: classRows.filter((row) => row.dwarfVtableMatched).length,
    dwarfVirtualSlotComparisons: layoutComparisons.length,
    dwarfVirtualSlotsMatched: layoutComparisons.filter((row) => row.status === 'matched').length,
    dwarfVirtualSlotMismatches: layoutComparisons.filter((row) => row.status === 'mismatch').length,
  },
  memberMetrics,
  typeMetrics,
  memberResults,
  contradictions,
  typeDisagreements,
  vtableContradictions: vtableLayoutMismatches.map((row) => ({
    address: row.targetAddress,
    className: classRows.find((cls) => cls.dwarfLayoutComparisons.includes(row))?.className ?? null,
    claim: { method: row.method, slotIndex: row.hexVtableIndex },
    dwarfTruth: { method: row.method, slotIndex: row.dwarfVtableIndex },
  })),
  classExamples: classRows.filter((row) => row.dwarfClassMatched || row.dwarfVtableMatched).slice(0, 24),
  samplePseudocode,
  virtualCallSample: analyzed.find((row) => row.virtualSlotCount > 0) ?? null,
  analyzedSamples: analyzed.slice(0, 40),
  recentFailures: failures,
};
writeReport(report, args.out);
