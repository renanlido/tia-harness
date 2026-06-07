# spec.validate — deterministic rule reference

The authoritative cross-field rules `spec.validate` applies **on top of** the JSON
Schema (`../../schemas/project-spec.schema.json`). Each rule is deterministic and has a
stable ID used verbatim in the violation report. Derived from
`docs/TIA-BEST-PRACTICES.md` §13.2 and §14, `docs/TIA-CPU-REFERENCE.md`, and
`docs/HARNESS-MCP-ARCHITECTURE.md` (gates/guards). **No rule here calls the MCP** —
where a rule can only be *fully* confirmed at runtime (e.g. an MLFB exists in the
installed catalog), it degrades to a `warning` with a hint to resolve via `GET /catalog`.

| Rule ID | Severity | Predicate (must hold) | On failure |
|---|---|---|---|
| `SCHEMA` | error | Spec validates against the Draft 2020-12 schema, `additionalProperties:false`. | Report each schema error with its field path. |
| `R-NAMES` | error | Device names unique; subnet names unique; tag-table names unique; UDT names unique; tag names unique within their `table`; functional-unit names unique. | Name the duplicated value and both paths. |
| `R-TYPEID` | error | Every `typeIdentifier` and module `order` matches `^OrderNumber:.+/V[0-9]+\.[0-9]+$` — a forward **slash** before `V`. | Reject. If the value uses `:V`, call out the known V21 drift bug explicitly. |
| `R-TYPEID-RESOLVE` | warning | The MLFB+firmware pair plausibly exists in the installed catalog. | Cannot be confirmed offline → warn: "resolve via `GET /catalog`; pass `typeIdentifierNormalized` straight through." |
| `R-SUBNET` | error | For each CPU: the CPU and all its IO-devices resolve to the **same** subnet; every node `ip` is inside its subnet CIDR; each `networkNode.device` references a declared device; per IO-system exactly one CPU node has `createIoSystem:true`. | Name the offending node/IP and the two subnets, or the out-of-range IP. |
| `R-MODLIMIT` | error | Module count for a device is within its CPU's expansion limits (table below). | Report `<n> modules > limit <m>` for `<family/model>`. |
| `R-PTORELAY` | error | An S7-1200 device with `outputType:"relay"` does not request on-board PTO/PWM. | Reject relay+PTO; suggest DC/DC/DC or a signal board. |
| `R-LANGFAM` | error | Block languages are valid for the target family: **no STL, no GRAPH on S7-1200**. Checks `conventions.defaultLanguages.*` and `blocks[].language` against each CPU's `family`. | Name the language and the S7-1200 device. |
| `R-LANG-PORT` | warning | When a target is S7-1200, flag generated logic relying on 1500-only features. | Warn (portability: 1200→1500 copies forward; reverse can break). |
| `G5-SAFETY` | error | NOT (`safety.required === true` AND `autonomous === true`). | **REJECT.** F-logic is never authored/modified/downloaded autonomously (IEC 61511 MOC, gate G5). Selecting an F-CPU is fine; autonomous F authoring is not. |
| `R-OPTIMIZED` | warning | `conventions.optimizedAccess` is `true` (baseline §0). | Warn if `false` (legacy absolute/pointer/AT interop only; carries overhead). |
| `R-SYMBOLIC` | warning | `conventions.symbolicOnly` is `true` (baseline §0). | Warn if `false`. |
| `R-UDT-FIRST` | warning | Every block interface / structured datum is UDT-typed; UDTs are declared before dependent blocks reference them. | Warn where an interface is untyped or a referenced UDT is missing. |
| `R-SAFETY-FGROUPS` | error | If `safety.required`, `safety.fRuntimeGroups` (when given) is in 0..2. | Reject > 2 (max 2 F-runtime groups, §9). |

## S7-1200 module-expansion limits (`R-MODLIMIT`)

Signal modules (SM) limit is model-dependent; SB and CM/CP limits are shared.

| CPU | SM | SB | CM/CP |
|---|---|---|---|
| 1211C | 0 | 1 | 3 |
| 1212C | 2 | 1 | 3 |
| 1214C / 1215C / 1217C | 8 | 1 | 3 |

S7-1500: up to **32** modules centrally (plus ET 200MP/SP/PRO distributed). When the
exact model cannot be inferred from the MLFB, apply the most permissive limit for the
family and emit `R-MODLIMIT` only on a clear breach, with a hint to confirm via catalog.

If `module.kind` is absent, count all modules against the SM limit conservatively and
warn that `kind` (SM/SB/CM) should be set for an exact check.

## Family / language matrix (`R-LANGFAM`)

| Language | S7-1200 | S7-1500 |
|---|---|---|
| LAD | yes | yes |
| FBD | yes | yes |
| SCL | yes | yes |
| STL | **no** | yes |
| GRAPH | **no** | yes |

## Capability gate (`R-PTORELAY`)

High-speed on-board PTO/PWM is valid **only** on S7-1200 **DC/DC/DC** (MLFB 5th char
`1A`) and on the 1217C differential outputs. Relay variants (`1B` AC/DC/Relay, `1H`
DC/DC/Relay) cannot drive on-board pulse outputs — route to a signal board or reject.

## Notes on determinism and the catalog boundary

- Rules that depend only on the spec text (`R-NAMES`, `R-TYPEID`, `R-SUBNET`,
  `R-LANGFAM`, `G5-SAFETY`, ...) are **fully deterministic offline** and are `error`s.
- Rules that would need the live installed catalog to be *certain*
  (`R-TYPEID-RESOLVE`, exact memory/limit drift) are `warning`s with a
  resolve-via-`/catalog` hint — `spec.validate` never calls the MCP itself.
- `spec.validate` reports; it does not fix. Fixes are the user's (or a later,
  gated, scaffold step's) responsibility.
