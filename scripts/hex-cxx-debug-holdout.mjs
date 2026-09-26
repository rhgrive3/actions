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

function dwarfTypeCompatible(member, truth) {
  const category = member.category;
  const type = truth?.type ?? null;
  if (!category || !type || type.category === 'unknown') return 'unknown';
  const size = Number(member.sizeBytes ?? 0);
  const dwarfSize = Number(type.sizeBytes ?? 0);
  if (category === 'float' || category === 'double') {
    return type.category === 'float' && dwarfSize === size ? 'match' : 'mismatch';
  }
  if (category === 'pointer') {
    return type.category === 'pointer' && dwarfSize === size ? 'match' : 'mismatch';
  }
  if (category === 'array-like') {
    return type.category === 'array' ? 'match' : 'mismatch';
  }
  if (category === 'bool-like') {
    return type.category === 'boolean' || (type.category === 'integer' && dwarfSize === 1)
      ? 'match' : 'mismatch';
  }
  const widthMatch = /^int(8|16|32|64)$/.exec(category);
  if (widthMatch) {
    if (!['integer', 'enum'].includes(type.category) || dwarfSize !== Number(widthMatch[1]) / 8) return 'mismatch';
    if (member.signedness != null && type.signedness != null && member.signedness !== type.signedness) return 'mismatch';
    return 'match';
  }
  return 'unknown';
}

const args = argsOf(process.argv.slice(2));
for (const key of ['target-root', 'binary', 'oracle', 'out', 'variant']) {
  if (!args[key]) throw new Error('missing-' + key);
}
const targetRoot = path.resolve(args['target-root']);
const binary = path.resolve(args.binary);
const oracle = JSON.parse(fs.readFileSync(args.oracle, 'utf8'));
if (oracle.schema !== 'cxx-dwarf-oracle/v1') throw new Error('unexpected-dwarf-oracle-schema');

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
const symbols = new SymbolIndex({
  addrs: rawSymbols.map((symbol) => symbol.address),
  names: rawSymbols.map((symbol) => symbol.name),
  kinds: rawSymbols.map(() => 0),
  flags: rawSymbols.map(() => 0),
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
const dwarfClasses = new Map(oracle.classes.map((item) => [item.className, item]));
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
  const dwarf = first.receiverClass ? dwarfClasses.get(first.receiverClass) : null;
  const members = (dwarf?.members || []).filter((member) => member.offsetBytes === first.offsetBytes);
  let status = 'unknown';
  let truth = null;
  if (!dwarf?.complete) {
    status = 'unknown';
    truth = 'no complete DW_TAG_class_type/structure_type with this exact class name';
  } else if (members.length === 0) {
    if ((dwarf.unresolvedMemberLocations || 0) > 0) {
      status = 'unknown';
      truth = 'DWARF has unresolved member/base locations; no exact member at this offset was established';
    } else {
      status = 'contradicted';
      truth = 'DWARF class ' + first.receiverClass + ' has no data member at byte offset ' + first.offsetBytes;
    }
  } else if (members.length > 1) {
    const typed = claims.filter((claim) => claim.category != null);
    const checks = typed.map((claim) => members.map((member) => dwarfTypeCompatible(claim, member)));
    if (checks.some((row) => row.every((check) => check === 'mismatch'))) status = 'contradicted';
    else if (checks.every((row) => row.includes('match'))) status = 'confirmed';
    else if (typed.length === 0) status = 'confirmed';
    else status = 'unknown';
    truth = members.map((member) => ({
      name: member.name,
      offsetBytes: member.offsetBytes,
      type: member.type,
      declaringClass: member.declaringClass,
    }));
  } else {
    const member = members[0];
    const typed = claims.filter((claim) => claim.category != null);
    const checks = typed.map((claim) => dwarfTypeCompatible(claim, member));
    if (checks.some((check) => check === 'mismatch')) status = 'contradicted';
    else if (checks.every((check) => check === 'match')) status = 'confirmed';
    else status = 'unknown';
    truth = {
      name: member.name,
      offsetBytes: member.offsetBytes,
      type: member.type,
      declaringClass: member.declaringClass,
    };
  }
  memberResults.push({
    className: first.receiverClass,
    offsetBytes: first.offsetBytes,
    status,
    hexClaims: claims,
    dwarfTruth: truth,
  });
}

const layoutComparisons = classRows.flatMap((row) => row.dwarfLayoutComparisons);
const contradictedMembers = memberResults.filter((row) => row.status === 'contradicted');
const vtableLayoutMismatches = layoutComparisons.filter((row) => row.status === 'mismatch');
const confirmedMembers = memberResults.filter((row) => row.status === 'confirmed');
const unknownMembers = memberResults.filter((row) => row.status === 'unknown');
const sampleMember = confirmedMembers[0] ?? null;
const samplePseudocode = sampleMember?.hexClaims.find((claim) => claim.pseudocodeLines.length) ?? null;
const classesWithNames = classRows.filter((row) => row.className);
const report = {
  schema: 'hex-cxx-debug-holdout/v1',
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
  memberMetrics: {
    claimed: memberResults.length,
    confirmed: confirmedMembers.length,
    contradicted: contradictedMembers.length,
    unknown: unknownMembers.length,
    claimRecords: allClaims.length,
    distinctClasses: new Set(memberResults.map((row) => row.className).filter(Boolean)).size,
  },
  memberResults,
  contradictions: contradictedMembers.map((row) => ({
    address: row.hexClaims[0]?.functionAddress ?? null,
    function: row.hexClaims[0]?.symbol ?? null,
    className: row.className,
    memberOffsetBytes: row.offsetBytes,
    claim: row.hexClaims.map((claim) => ({
      typeLabel: claim.typeLabel,
      category: claim.category,
      sizeBytes: claim.sizeBytes,
      pseudocodeLines: claim.pseudocodeLines,
    })),
    dwarfTruth: row.dwarfTruth,
  })),
  vtableContradictions: vtableLayoutMismatches.map((row) => ({
    address: row.targetAddress,
    className: classRows.find((cls) => cls.dwarfLayoutComparisons.includes(row))?.className ?? null,
    claim: { method: row.method, slotIndex: row.hexVtableIndex },
    dwarfTruth: { method: row.method, slotIndex: row.dwarfVtableIndex },
  })),
  classExamples: classRows.filter((row) => row.dwarfClassMatched || row.dwarfVtableMatched).slice(0, 24),
  samplePseudocode: samplePseudocode ? {
    className: sampleMember.className,
    offsetBytes: sampleMember.offsetBytes,
    dwarfMember: sampleMember.dwarfTruth,
    address: samplePseudocode.functionAddress,
    function: samplePseudocode.symbol,
    hexType: samplePseudocode.typeLabel,
    lines: samplePseudocode.pseudocodeLines,
  } : null,
  virtualCallSample: analyzed.find((row) => row.virtualSlotCount > 0) ?? null,
  analyzedSamples: analyzed.slice(0, 40),
  recentFailures: failures,
};
fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
fs.writeFileSync(path.resolve(args.out), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  variant: report.variant,
  provider: report.provider,
  candidateCount: report.candidateCount,
  analyzedFunctions: report.analyzedFunctions,
  classMetrics: report.classMetrics,
  memberMetrics: report.memberMetrics,
  sample: report.samplePseudocode ? {
    className: report.samplePseudocode.className,
    offsetBytes: report.samplePseudocode.offsetBytes,
    address: report.samplePseudocode.address,
    function: report.samplePseudocode.function,
  } : null,
}, null, 2));
