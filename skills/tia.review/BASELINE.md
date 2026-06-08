# tia.review — baseline checklist (authoritative rule table)

The non-negotiable baseline (TIA best-practices §0), expressed as audit
rules. Each rule: **what to read** (which `tia` read tool), the **predicate** (pass
condition), and **severity** (`error` = breaks the baseline; `warning` = style/maintainability).
All reads are class R (read-only).

| ID | Baseline rule | What to read | Predicate (PASS) | Severity |
|---|---|---|---|---|
| **B-OPT** | Optimized block access ON | block attribute via `tia_obj_get` on the block handle (the typed `tia_plc_blocks` may not expose it) — look for the "optimized access" / `MemoryLayout` attribute | every FB/FC/DB has optimized access = true (unless a documented reason: legacy/AT-overlay) | error |
| **B-SYM** | 100% symbolic addressing | `tia_plc_tags` (tags have names + addresses); block bodies via `tia_export_xml` if a deep check is needed | no logic addresses memory absolutely (`%I/%Q/%M/%DB`) where a symbol should exist; all I/O mapped to named tags | error |
| **B-FB-IDB** | State in FBs + instance DBs | `tia_plc_blocks` (types: OB/FB/FC/DB; `instanceOfName` where present) | reusable logic is in **FB**s with **instance DBs**; global DBs hold data, not ad-hoc state machines | warning |
| **B-UDT** | Everything typed via UDT | `tia_plc_types` (UDTs) + DB/block interfaces | structured/repeated data uses **UDTs** (PLC data types); no copy-pasted struct layouts | warning |
| **B-LANG** | Right language per task & family | `tia_plc_blocks` (`language`) + `tia_devices` (family) | language fits the task (SCL for math/loops, LAD/FBD for bool/interlocks, GRAPH for sequences) AND the family — **no STL/GRAPH on S7-1200** | error (family), warning (fit) |
| **B-TYPE** | Reuse via versioned library TYPEs | `tia_plc_blocks` / project libraries; `isKnowHowProtected` | repeated equipment uses **versioned library TYPEs**, not duplicated master copies | warning |
| **B-NAME** | Uniform naming | all of the above (block/tag/UDT/device names) | names follow one scheme consistently (default = PLCopen prefixes below); consistent case/separators | warning |
| **B-CONSIST** | Blocks consistent (compile-current) | `tia_plc_blocks` (`isConsistent`) | every block `isConsistent:true` (inconsistent ⇒ stale; the audit is over old data → run `tia.verify`) | error |
| **B-SAFETY** | F is read-only | `tia_plc_blocks` (F-blocks / safety container), `safety-reviewer` subagent | F-program reported only (signatures/presence); **never** opened-for-edit or modified here (G5) | n/a (posture) |

## Default PLCopen-style naming prefixes (B-NAME)

Configurable, but enforce ONE scheme uniformly. Default reference:

| Object | Prefix / pattern | Example |
|---|---|---|
| Function Block | `FB_` / PascalCase role | `FB_Motor`, `FB_Valve` |
| Function | `FC_` | `FC_ScaleAnalog` |
| Instance DB | `iDB_<fb>` / `<fb>_DB` | `iDB_Motor01` |
| Global DB | `DB_` / `gDB_` | `DB_Recipe` |
| UDT (PLC data type) | `UDT_` / `typeXxx` | `UDT_MotorCmd` |
| Tag (input/output/memory) | area + role, symbolic | `Start_PB`, `Motor01_Run` |
| Tag table | `TT_` / area | `TT_IO_Field` |
| Device / station | role + index | `PLC_1`, `ET200_01` |

## Audit notes

- **Reading optimized access:** the typed `tia_plc_blocks` lists blocks but may not include
  the optimized-access flag. Resolve the block's object handle (`tia_obj_roots` →
  `tia_obj_items` down to the block) and read its attributes with `tia_obj_get`.
- **Deep body checks** (absolute addressing, language mix inside a block) need the block
  body: use `tia_export_xml` to a directory and inspect the SimaticML, or report at the
  block level from `tia_plc_blocks` metadata if a full export is not wanted.
- **Never mutate.** Every finding is a *recommendation*. Writes belong to `tia.scaffold`
  (offline) behind the human; F changes never happen here (G5).
