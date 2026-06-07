# cpu.select — CPU reference (distilled)

A distilled selection reference for `cpu.select`, condensed from the SIMATIC S7-1500/
S7-1200 CPU reference. **Convenience reference, not ground truth** — the only
authoritative list at runtime is `GET /catalog`. Figures marked ⚠ drift by catalog
generation; confirm against the installed catalog before building. All order numbers
below are *representative*.

## The TypeIdentifier contract

```
OrderNumber:<MLFB>/V<major>.<minor>      # forward SLASH before V; ":V2.9" is a V21 drift bug
e.g. OrderNumber:6ES7 511-1AK02-0AB0/V2.9
```

MLFB (the order number) selects the **model + hardware functional state** (trailing
`00`/`01`/`02` HW revisions); `/V<fw>` selects **firmware**, an independent axis. The
space-after-`6ES7` form is accepted; the unspaced form is the same number. `GET /catalog`
returns `typeIdentifierNormalized` — pass that straight through rather than hand-building.

### MLFB variant letter (5th char) → sub-family

| Char | Sub-family | Char | Sub-family |
|---|---|---|---|
| `A` | Standard | `R` | Redundant (media-redundant) |
| `C` | Compact (onboard I/O) | `H`/`J` | Redundant (H / HF fiber-sync) |
| `F` | Fail-safe (safety) | `X` | MFP (Linux + C/C++) |
| `T` | Technology (motion) | `U` | Technology + Fail-safe (TF) |

S7-1200 power/output variant (5th char): `1A` = DC/DC/DC, `1B` = AC/DC/Relay, `1H` =
DC/DC/Relay.

CPU-type numbers: `511→1511, 513→1513, 515→1515, 516→1516, 517→1517, 518→1518`;
`510/512` = ET 200SP; `672` = software controller; `677` = Open Controller. S7-1200:
`211→1211C, 212→1212C, 214→1214C, 215→1215C, 217→1217C`.

## Family decision: S7-1200 vs S7-1500

| Aspect | S7-1200 | S7-1500 |
|---|---|---|
| Work memory | 50–150 KB (classic) | 250 KB – 60 MB ⚠ |
| Bit-instr. time | ~0.08–0.1 µs | ~1–10 ns |
| On-board display | No (classic) / yes on G2 | Yes |
| Languages | LAD, FBD, SCL | + **STL**, + **GRAPH** |
| Optimized access | Yes | Yes |
| Max modules | ~8 (2–8 SM + 3 CM + 1 SB) | up to 32 (+ ET 200MP/SP/PRO) |
| Fieldbus | PN (1–2 ports); DP via CM | PN (2–3 ports); DP on `-3/-4` |
| Engineering tool | STEP 7 Basic | STEP 7 Professional |

- **Choose S7-1200** for cost-sensitive serial OEM machines, fixed scope, small/medium
  I/O, basic PTO motion, STEP 7 Basic budget, compact footprint.
- **Choose S7-1500** for performance/large memory/advanced motion/heavy diagnostics/many
  distributed I/O/evolving scope, or when STL/GRAPH or a display is needed.
- **Portability:** S7-1200 code copies forward into S7-1500 almost always; the reverse
  can break on 1500-only instructions (STL/GRAPH).

## S7-1500 — standard CPUs (the tier ladder)

| CPU | Program mem | Data mem | Bit-op | Interfaces | Representative MLFB |
|---|---|---|---|---|---|
| 1511-1 PN | 150 KB | 1 MB | 60 ns | 1× PN IRT | `6ES7 511-1AK02-0AB0` (project default) |
| 1513-1 PN | 300 KB | 1.5 MB | 40 ns | 1× PN IRT | `6ES7 513-1AL02-0AB0` |
| 1515-2 PN | 500 KB | 3 MB | 30 ns | 2× PN | `6ES7 515-2AM02-0AB0` |
| 1516-3 PN/DP | 1 MB | 5 MB | 10 ns | 2× PN + 1× DP | `6ES7 516-3AN02-0AB0` |
| 1517-3 PN/DP | 2 MB | 8 MB | 2 ns | 2× PN + 1× DP | `6ES7 517-3AP00-0AB0` |
| 1518-4 PN/DP | 4/6 MB ⚠ | 20/60 MB ⚠ | ~1 ns ⚠ | 3× PN (1 GbE) + 1× DP | `6ES7 518-4AP00-0AB0` |

Compact (onboard I/O): 1511C `6ES7 511-1CK00-0AB0`, 1512C `6ES7 512-1CK00-0AB0`.

## S7-1500 — sub-family selectors

| Need | Sub-family | Example MLFB |
|---|---|---|
| Integrated safety (SIL3/PLe) | **F** | 1516F `6ES7 516-3FN00-0AB0`, 1518F `6ES7 518-4FP03-0AB0` |
| Advanced motion (sync/cam/kinematics) | **T / TF** | 1515T `6ES7 515-2TM01-0AB0`, 1517TF `6ES7 517-3UP00-0AB0` |
| Hot-standby redundancy | **R / H / HF** | 1513R `6ES7 513-1RM03-0AB0`, 1517H `6ES7 517-3HP00-0AB0`, 1518HF `6ES7 518-4JP00-0AB0` |
| Distributed/compact CPU | **ET 200SP** | 1510SP `6ES7 510-1DJ01-0AB0`, 1512SP `6ES7 512-1DM03-0AB0` |
| C/C++ + Linux alongside PLC | **MFP/ODK** | 1518 MFP `6ES7 518-4AX00-1AB0` |
| PC-based / IT-OT | **Software / Open Controller** ⚠ | 1507S `6ES7 672-7AC01-0YA0`, 1515SP PC2 `6ES7 677-2DB42-0GB0` |

⚠ Software/Open Controllers may not be `OrderNumber:`-creatable as ordinary stations in
V21 — verify on the target machine.

## S7-1500 decision order (apply in sequence)

1. **I/O count / address space** → 1511 (small) → 1515/1516 (mid) → 1517/1518 (large);
   ET 200SP (1510SP/1512SP) for compact distributed.
2. **Scan / performance** → bit-op time headline (60 ns@1511 → ~1 ns@1518).
3. **Memory** → by program *and* data size; prioritize data figure for large DBs/recipes.
4. **Communication** → 1 PN (1511/1513); 2 PN (1515); + DP ⇒ `-3 PN/DP` (1516/1517),
   `-4` (1518).
5. **Safety** → any safety function ⇒ **F** CPU (one CPU runs standard + F-program).
   *F-logic is human-authored and gated (G5) — selecting an F-CPU is allowed; authoring
   is never autonomous.*
6. **Redundancy** → **R** (media-redundant) or **H/HF** (fiber-sync, bumpless); **HF** =
   redundancy + fail-safe.
7. **Motion** → synchronized/cam/kinematics ⇒ **T/TF** (basic positioning is on all CPUs).
8. **Custom code / edge** → C/C++ or Linux subsystem ⇒ **MFP/ODK** 1518.
9. **PC-based / virtualization** → software **1505S/1507S/1508S** or Open Controller
   1515SP PC.

## S7-1200 — classic family (FW V4.x, MLFB suffix `40-0XB0`)

| CPU | Work mem | Onboard I/O | Max SM | When |
|---|---|---|---|---|
| 1211C | 50 KB | 6 DI / 4 DQ / 2 AI | 0 | very small machines/panels, few I/O |
| 1212C | 75 KB | 8 DI / 6 DQ / 2 AI | 2 | small machines, simple sequencing |
| 1214C | 100/125 KB ⚠ | 14 DI / 10 DQ / 2 AI | 8 | the workhorse — most common |
| 1215C | 125 KB | 14 DI / 10 DQ / 2 AI / 2 AQ | 8 | + analog out, 2 PN (line/ring), redundant 24 V |
| 1217C | 150 KB | 14 DI / 10 DQ / 2 AI / 2 AQ (4+4 differential, 1 MHz) | 8 | high-speed motion/measurement (DC/DC/DC only) |

Shared: 6 HSC, 4 PTO/PWM, 1 SB, 3 CM/CP. **No STL, no GRAPH** on S7-1200. Optimized
access supported.

### S7-1200 power/output variants (pick after size)

| Variant | 5th char | On-board high-speed PTO/PWM? | Representative MLFB (1214C) |
|---|---|---|---|
| DC/DC/DC | `1A` | **Yes** (only this, + 1217C differential) | `6ES7214-1AG40-0XB0` |
| AC/DC/Relay | `1B` | No (relay outputs slow) | `6ES7214-1BG40-0XB0` |
| DC/DC/Relay | `1H` | No | `6ES7214-1HG40-0XB0` |

Other sizes follow the pattern: `6ES7211-1{A,B,H}E40-0XB0`, `6ES7212-1{A,B,H}E40-0XB0`,
`6ES7215-1{A,B,H}G40-0XB0`, `6ES7217-1AG40-0XB0` (1217C is DC/DC/DC only).

**Capability gate:** PTO/PWM / high-speed motion only on DC/DC/DC (and 1217C
differential). Reject relay-variant + PTO early, or route to a signal board.

### S7-1200 Fail-safe (FC) — machine safety in one CPU (FW V4.5, STEP 7 Safety V17+)

| MLFB | Type | Work mem |
|---|---|---|
| `6ES7212-1AF40-0XB0` | 1212FC DC/DC/DC | 100 KB |
| `6ES7214-1AF40-0XB0` | 1214FC DC/DC/DC | 125 KB |
| `6ES7215-1AF40-0XB0` | 1215FC DC/DC/DC | 150 KB |

Relay FC variants use the `1HF40` infix. SIPLUS extended-temp equivalents use `6AG1…`.

## S7-1200 G2 (~2024) — ⚠ incomplete

A new G2 generation (1212C G2, 1214C G2) adds an on-board display, more memory,
integrated motion/safety, NFC, OPC UA. Order numbers/limits not captured — verify on
SiePortal / `GET /catalog`.

## Selection guardrails to surface in the recommendation

- **Resolve, don't guess** — confirm MLFB + firmware via `GET /catalog`; pass the
  returned `typeIdentifierNormalized` to `device.create`.
- **TypeIdentifier** — `OrderNumber:<MLFB>/V<fw>`, slash before V (reject `:V`).
- **Capability gates** — S7-1200 PTO only on DC/DC/DC (and 1217C); S7-1200 has no
  STL/GRAPH; F-CPU selection is allowed but F-logic authoring is gated (G5).
- **Spec drift** — every ⚠ figure varies by catalog generation; the live catalog is the
  verifier.
