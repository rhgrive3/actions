#!/usr/bin/env python3
"""Extract class members and GCC virtual-slot indices from one ELF DWARF image."""

import argparse
import gc
import json
import multiprocessing
import os
import subprocess
from collections import defaultdict

from elftools.elf.elffile import ELFFile
from elftools.dwarf.dwarf_expr import DWARFExprParser


SCOPE_TAGS = {
    "DW_TAG_namespace", "DW_TAG_class_type", "DW_TAG_structure_type",
    "DW_TAG_union_type",
}
CLASS_TAGS = {"DW_TAG_class_type", "DW_TAG_structure_type", "DW_TAG_union_type"}


def attr(die, name):
    return die.attributes.get(name)


def text_attr(die, name):
    item = attr(die, name)
    if item is None:
        return None
    value = item.value
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return str(value)


def unsigned_integer(value):
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int) and value >= 0:
        return value
    return None


def expression_integer(die, value):
    """Evaluate the constant subset used by GCC data-member/vtable attributes."""
    if isinstance(value, int):
        return value if value >= 0 else None
    if not isinstance(value, bytes):
        return None
    try:
        ops = DWARFExprParser(die.cu.structs).parse_expr(value)
    except Exception:
        return None
    stack = []
    for op in ops:
        name = op.op_name
        args = op.args
        if name in ("DW_OP_constu", "DW_OP_consts") and args:
            stack.append(int(args[0]))
        elif name.startswith("DW_OP_lit"):
            try:
                stack.append(int(name.removeprefix("DW_OP_lit")))
            except ValueError:
                return None
        elif name == "DW_OP_plus_uconst" and args:
            if stack:
                stack[-1] += int(args[0])
            else:
                stack.append(int(args[0]))
        elif name == "DW_OP_plus":
            if len(stack) < 2:
                return None
            right = stack.pop()
            stack[-1] += right
        elif name == "DW_OP_stack_value":
            continue
        else:
            return None
    return stack[-1] if len(stack) == 1 and stack[-1] >= 0 else None


def die_name(die):
    return text_attr(die, "DW_AT_name")


def qualified_name(die):
    parts = []
    current = die
    while current is not None:
        if current.tag in SCOPE_TAGS:
            name = die_name(current)
            if name and name not in ("<anonymous>", "(anonymous namespace)"):
                parts.append(name)
        current = current.get_parent()
    if not parts:
        return None
    return "::".join(reversed(parts))


def resolve_type(die, seen=None):
    if die is None:
        return {"name": None, "category": "unknown", "sizeBytes": None, "signedness": None, "tag": None}
    seen = set() if seen is None else seen
    identity = (die.cu.cu_offset, die.offset)
    if identity in seen:
        return {"name": die_name(die), "category": "unknown", "sizeBytes": None, "signedness": None, "tag": die.tag}
    seen.add(identity)

    own_name = die_name(die)
    size_attr = attr(die, "DW_AT_byte_size")
    size = unsigned_integer(size_attr.value) if size_attr else None
    category = "unknown"
    signedness = None

    if die.tag in ("DW_TAG_pointer_type", "DW_TAG_reference_type", "DW_TAG_rvalue_reference_type"):
        category = "pointer"
    elif die.tag == "DW_TAG_array_type":
        category = "array"
    elif die.tag == "DW_TAG_enumeration_type":
        category = "enum"
        base = die.get_DIE_from_attribute("DW_AT_type") if attr(die, "DW_AT_type") else None
        if base is not None:
            base_info = resolve_type(base, seen)
            size = size or base_info.get("sizeBytes")
            signedness = base_info.get("signedness")
    elif die.tag == "DW_TAG_base_type":
        encoding_attr = attr(die, "DW_AT_encoding")
        encoding = unsigned_integer(encoding_attr.value) if encoding_attr else None
        if encoding == 0x02:
            category = "boolean"
        elif encoding == 0x04:
            category = "float"
        elif encoding in (0x05, 0x06):
            category, signedness = "integer", True
        elif encoding in (0x07, 0x08):
            category, signedness = "integer", False
    elif die.tag in ("DW_TAG_class_type", "DW_TAG_structure_type", "DW_TAG_union_type"):
        category = "aggregate"

    if category == "unknown" and die.tag in (
        "DW_TAG_typedef", "DW_TAG_const_type", "DW_TAG_volatile_type",
        "DW_TAG_restrict_type", "DW_TAG_atomic_type",
    ):
        base = die.get_DIE_from_attribute("DW_AT_type") if attr(die, "DW_AT_type") else None
        if base is not None:
            base_info = resolve_type(base, seen)
            category = base_info.get("category", "unknown")
            signedness = base_info.get("signedness")
            size = size or base_info.get("sizeBytes")
            if not own_name:
                own_name = base_info.get("name")

    return {
        "name": own_name,
        "category": category,
        "sizeBytes": size,
        "signedness": signedness,
        "tag": die.tag,
    }


def type_for_member(die):
    type_die = die.get_DIE_from_attribute("DW_AT_type") if attr(die, "DW_AT_type") else None
    return resolve_type(type_die)


def member_row(die):
    location = attr(die, "DW_AT_data_member_location")
    if location is None:
        return None
    offset = expression_integer(die, location.value)
    if offset is None:
        return {"name": die_name(die), "offsetBytes": None, "locationUnresolved": True, "type": type_for_member(die)}
    return {"name": die_name(die), "offsetBytes": offset, "locationUnresolved": False, "type": type_for_member(die)}


def vtable_index(die):
    item = attr(die, "DW_AT_vtable_elem_location")
    if item is None:
        return None
    return expression_integer(die, item.value)


def class_definition(die):
    name = qualified_name(die)
    if not name:
        return None
    declaration_attr = attr(die, "DW_AT_declaration")
    declaration = bool(declaration_attr and declaration_attr.value)
    direct_members = []
    unresolved_members = 0
    bases = []
    virtual_methods = []
    for child in die.iter_children():
        if child.tag == "DW_TAG_member":
            row = member_row(child)
            if row is None:
                continue
            if row["locationUnresolved"]:
                unresolved_members += 1
            direct_members.append(row)
        elif child.tag == "DW_TAG_inheritance":
            base_die = child.get_DIE_from_attribute("DW_AT_type") if attr(child, "DW_AT_type") else None
            base_name = qualified_name(base_die) if base_die is not None else None
            location = attr(child, "DW_AT_data_member_location")
            base_offset = expression_integer(child, location.value) if location is not None else None
            bases.append({"className": base_name, "offsetBytes": base_offset})
        elif child.tag == "DW_TAG_subprogram":
            virtuality = attr(child, "DW_AT_virtuality")
            if virtuality is None or int(virtuality.value) == 0:
                continue
            virtual_methods.append({
                "name": die_name(child),
                "linkageName": text_attr(child, "DW_AT_linkage_name") or text_attr(child, "DW_AT_MIPS_linkage_name"),
                "vtableIndex": vtable_index(child),
            })
    complete = not declaration
    byte_size_attr = attr(die, "DW_AT_byte_size")
    return {
        "className": name,
        "complete": complete,
        "byteSize": unsigned_integer(byte_size_attr.value) if byte_size_attr else None,
        "directMembers": direct_members,
        "members": [],
        "bases": bases,
        "virtualMethods": virtual_methods,
        "unresolvedMemberLocations": unresolved_members,
    }


def flattened_members(name, definitions, active=None):
    active = set() if active is None else active
    if name in active:
        return [], 1
    active.add(name)
    rows = []
    unresolved = 0
    for definition in definitions.get(name, []):
        for item in definition["directMembers"]:
            if item["offsetBytes"] is None:
                unresolved += 1
                continue
            rows.append({**item, "declaringClass": name, "baseOffsetBytes": 0})
        unresolved += definition["unresolvedMemberLocations"]
        for base in definition["bases"]:
            if base["className"] is None or base["offsetBytes"] is None:
                unresolved += 1
                continue
            base_rows, base_unresolved = flattened_members(base["className"], definitions, active.copy())
            unresolved += base_unresolved
            for item in base_rows:
                rows.append({
                    **item,
                    "offsetBytes": item["offsetBytes"] + base["offsetBytes"],
                    "baseOffsetBytes": item.get("baseOffsetBytes", 0) + base["offsetBytes"],
                })
    unique = {}
    for row in rows:
        key = (row["offsetBytes"], row.get("name"), row["type"].get("name"), row["type"].get("category"), row.get("declaringClass"))
        unique[key] = row
    return list(unique.values()), unresolved


def vtable_symbols(elf):
    result = []
    for section_name in (".symtab", ".dynsym"):
        section = elf.get_section_by_name(section_name)
        if section is None:
            continue
        for symbol in section.iter_symbols():
            name = symbol.name
            if not name.startswith("_ZTV") or not name:
                continue
            result.append({"name": name, "address": int(symbol["st_value"]), "size": int(symbol["st_size"])})
    unique = {(item["name"], item["address"]): item for item in result}
    return sorted(unique.values(), key=lambda item: (item["address"], item["name"]))


def vtable_class_names(tables):
    if not tables:
        return set()
    result = subprocess.run(
        ["c++filt"],
        input="\n".join(item["name"] for item in tables) + "\n",
        text=True,
        capture_output=True,
        check=True,
        timeout=60,
    )
    names = set()
    for line in result.stdout.splitlines():
        prefix = "vtable for "
        if line.startswith(prefix):
            name = line[len(prefix):].strip()
            if name:
                names.add(name)
    return names


def build_id(elf):
    for segment in elf.iter_segments():
        if segment.header.p_type != "PT_NOTE":
            continue
        try:
            for note in segment.iter_notes():
                if note.get("n_type") == "NT_GNU_BUILD_ID":
                    value = note.get("n_desc")
                    return value.hex() if isinstance(value, bytes) else str(value)
        except Exception:
            continue
    return None


def collect_cu_offsets(binary):
    """Return the byte offset of every compilation unit in .debug_info.

    Reading the unit-length fields directly avoids pyelftools materialising (and
    caching) every CU header just to discover where the units start, which keeps
    the parent process' memory flat before the workers fan out.
    """
    offsets = []
    with open(binary, "rb") as stream:
        elf = ELFFile(stream)
        section = elf.get_section_by_name(".debug_info")
        if section is None:
            return offsets
        size = section["sh_size"]
        base = section["sh_offset"]
        offset = 0
        while offset < size:
            offsets.append(offset)
            stream.seek(base + offset)
            first = stream.read(4)
            if len(first) < 4:
                break
            value = int.from_bytes(first, "little")
            header = 4
            if value == 0xFFFFFFFF:
                extended = stream.read(8)
                if len(extended) < 8:
                    break
                value = int.from_bytes(extended, "little")
                header = 12
            if value <= 0:
                break
            offset += header + value
    return offsets


def definitions_for_offsets(offsets, binary, target_class_names, target_class_leaves):
    """Extract class definitions for the given CU offsets.

    Class/member facts live under CU, namespace, and class scopes. Walking every
    DIE also decodes millions of function/local-variable records this oracle never
    uses, so descend through type scopes only. Each CU's parsed DIE list is dropped
    and the pyelftools CU cache is cleared after processing so peak memory stays
    bounded to roughly one compilation unit per worker instead of the whole image.
    """
    definitions = defaultdict(list)
    versions = []
    with open(binary, "rb") as stream:
        elf = ELFFile(stream)
        dwarf = elf.get_dwarf_info()
        for index, cu_offset in enumerate(offsets):
            cu = dwarf.get_CU_at(cu_offset)
            versions.append(int(cu.header["version"]))
            pending = list(cu.get_top_DIE().iter_children())
            while pending:
                die = pending.pop()
                if die.tag not in SCOPE_TAGS:
                    continue
                if die.tag in CLASS_TAGS and die_name(die) in target_class_leaves:
                    definition = class_definition(die)
                    if definition is not None and definition["className"] in target_class_names:
                        definitions[definition["className"]].append(definition)
                pending.extend(child for child in die.iter_children() if child.tag in SCOPE_TAGS)
            try:
                cu._dielist.clear()
            except Exception:
                pass
            try:
                dwarf._cu_cache.clear()
                dwarf._cu_offsets_map.clear()
            except Exception:
                pass
            # DIE trees form reference cycles through _parent/cu, so reclaim them
            # periodically; collecting after every CU re-walks the same objects.
            if index % 8 == 7:
                gc.collect()
        gc.collect()
    return dict(definitions), versions


_WORKER_STATE = {}


def _worker_init(binary, target_class_names, target_class_leaves):
    _WORKER_STATE["binary"] = binary
    _WORKER_STATE["names"] = target_class_names
    _WORKER_STATE["leaves"] = target_class_leaves


def _worker_run(offsets):
    return definitions_for_offsets(
        offsets, _WORKER_STATE["binary"], _WORKER_STATE["names"], _WORKER_STATE["leaves"])


def collect_definitions(binary, target_class_names, target_class_leaves, offsets):
    """Fan CU parsing out across processes; fall back to a single pass on failure."""
    definitions = defaultdict(list)
    versions = []
    workers = min(max(len(offsets), 1), os.cpu_count() or 1, 16)
    if workers > 1 and offsets:
        chunks = [offsets[index::workers] for index in range(workers)]
        try:
            context = multiprocessing.get_context("fork")
            with context.Pool(
                processes=workers,
                initializer=_worker_init,
                initargs=(binary, target_class_names, target_class_leaves),
            ) as pool:
                for part, part_versions in pool.map(_worker_run, chunks):
                    for name, rows in part.items():
                        definitions[name].extend(rows)
                    versions.extend(part_versions)
            return definitions, versions
        except Exception:
            definitions = defaultdict(list)
            versions = []
    part, versions = definitions_for_offsets(offsets, binary, target_class_names, target_class_leaves)
    for name, rows in part.items():
        definitions[name].extend(rows)
    return definitions, versions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    with open(args.binary, "rb") as stream:
        elf = ELFFile(stream)
        if not elf.has_dwarf_info():
            raise SystemExit("oracle-no-dwarf-info")
        tables = vtable_symbols(elf)
        target_class_names = vtable_class_names(tables)
        target_class_leaves = {name.split("::")[-1] for name in target_class_names}
        definitions, dwarf_versions = collect_definitions(
            args.binary, target_class_names, target_class_leaves, collect_cu_offsets(args.binary))

        classes = []
        for name in sorted(target_class_names):
            entries = definitions.get(name, [])
            if not entries:
                classes.append({"className": name, "complete": False, "byteSize": None, "directMembers": [], "members": [], "bases": [], "virtualMethods": [], "unresolvedMemberLocations": 0})
                continue
            full = [entry for entry in entries if entry["complete"]]
            source = max(full or entries, key=lambda entry: (len(entry["directMembers"]), len(entry["virtualMethods"])))
            members = [
                {**member, "declaringClass": name, "baseOffsetBytes": 0}
                for member in source["directMembers"]
                if member["offsetBytes"] is not None
            ]
            classes.append({
                "className": name,
                "complete": bool(full),
                "byteSize": source["byteSize"],
                "directMembers": source["directMembers"],
                "members": members,
                "bases": source["bases"],
                "virtualMethods": source["virtualMethods"],
                "unresolvedMemberLocations": source["unresolvedMemberLocations"],
            })

        report = {
            "schema": "cxx-dwarf-oracle/v1",
            "binary": os.path.basename(args.binary),
            "buildId": build_id(elf),
            "architecture": elf.get_machine_arch(),
            "dwarfVersions": sorted(set(dwarf_versions)),
            "counts": {
                "classes": len(classes),
                "completeClasses": sum(item["complete"] for item in classes),
                "membersWithOffsets": sum(item["offsetBytes"] is not None for cls in classes for item in cls["directMembers"]),
                "virtualMethodsWithSlotIndex": sum(method["vtableIndex"] is not None for cls in classes for method in cls["virtualMethods"]),
                "vtableSymbols": len(tables),
                "vtableClassesWithDwarf": sum(item["complete"] for item in classes),
            },
            "classes": classes,
            "vtableSymbols": tables,
        }

    with open(args.out, "w", encoding="utf-8") as output:
        json.dump(report, output, indent=2, sort_keys=True)
        output.write("\n")
    print(json.dumps({"buildId": report["buildId"], "architecture": report["architecture"], "counts": report["counts"]}, sort_keys=True))


if __name__ == "__main__":
    main()
