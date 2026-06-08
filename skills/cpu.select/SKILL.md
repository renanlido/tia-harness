---
name: cpu.select
description: >-
  Recommend a Siemens S7-1500/S7-1200 CPU family + variant + order number (MLFB) from
  an engineering need (I/O count, scan/performance, memory, communication ports,
  safety, redundancy, motion). Use when the user asks "which CPU / PLC should I use",
  gives selection criteria instead of a model, or needs a typeIdentifier for a
  project-spec. Deterministic heuristic over the bundled CPU reference — NO MCP. Output:
  recommended CPU + justification + the OrderNumber:<MLFB>/V<fw> TypeIdentifier
  (flagged: confirm/resolve the concrete MLFB+firmware via GET /catalog before building).
---

# cpu.select — heuristic CPU selection (class R, no MCP)

Map an engineering **need** to a concrete SIMATIC CPU recommendation: family →
sub-family/variant → a representative **order number (MLFB)** → the TIA
**`TypeIdentifier`** string. Follows the decision logic of the
SIMATIC CPU reference (§5) and the §2 hardware guidance of the TIA best-practices
baseline (both distilled into `CPU-TABLE.md`).

This is **class R**: a deterministic heuristic over the **bundled reference table**
(`CPU-TABLE.md`). It uses **NO MCP tool** and does not open TIA. The curated table is a
*convenience reference*, **not** ground truth — so the recommendation always ends with
a flag to **resolve the concrete MLFB + firmware against `GET /catalog`** on the target
machine before `device.create` (V21 has no catalog tree-browse; only `Find` by
text/order-number). This gives value early, before the MCP runtime milestones exist.

## When to use

- The user describes requirements (I/O channels, scan time, memory, PN/DP ports,
  safety, redundancy, motion, PC-based) and wants a CPU choice.
- A project-spec needs a CPU `typeIdentifier` and the user has criteria, not a model.
- Right before `spec.validate` / scaffold, to fill `devices[].typeIdentifier`.

## Inputs

- The **need**: any of — digital/analog I/O count, scan-time/performance target, program
  + data memory size, number/type of fieldbus ports (PROFINET, PROFIBUS DP), safety
  (SIL/PL), redundancy/availability, motion class (basic positioning vs
  synchronized/cam/kinematics), PC-based/edge, on-board display, budget/engineering tool.
- The bundled **reference**: `CPU-TABLE.md` (families, variants, representative MLFBs,
  the variant-letter decoder, and the decision order).

## Outputs

A recommendation containing:

- `family` — `S7-1200` or `S7-1500` (with the family rationale).
- `model` / `subFamily` — e.g. `CPU 1516-3 PN/DP`, sub-family letter (none/C/F/T/R/H/S).
- `mlfb` — a representative order number (e.g. `6ES7 516-3AN02-0AB0`).
- `firmware` — a representative `/V<major>.<minor>` (e.g. `/V2.9`) — clearly marked as
  needing catalog confirmation.
- `typeIdentifier` — the assembled `OrderNumber:<MLFB>/V<fw>` string (slash, never `:V`).
- `variant` — for S7-1200, the power/output variant (DC/DC/DC vs relay) per the I/O need.
- `justification` — which criteria selected each axis (cite the decision step).
- `resolveNote` — **always**: "Confirm this MLFB + firmware exists via `GET /catalog`
  and pass the returned `typeIdentifierNormalized` to `device.create`; do not hand-build
  the string in production."
- `capabilityNotes` — any gates implied (e.g. relay variant ⇒ no on-board PTO; S7-1200
  ⇒ no STL/GRAPH; F-CPU ⇒ safety logic is human-authored/gated, never autonomous).

## Procedure (deterministic decision order)

1. **Family — S7-1200 vs S7-1500** (`CPU-TABLE.md` §family):
   - S7-1200 for cost-sensitive serial OEM machines with fixed scope, small/medium I/O,
     basic PTO motion, STEP 7 Basic budget, compact footprint.
   - S7-1500 for performance/fast scan, large memory (code *and* data), advanced motion
     (servo/IRT), heavy diagnostics, many distributed I/O, evolving scope, or when STL/
     GRAPH or an on-board display is required.
2. **S7-1500 tier & sub-family — apply criteria in order** (each narrows the choice):
   I/O count/address space → scan-time/performance (bit-op time) → memory (program *and*
   data; prioritize the data figure if DBs/recipes/trace are large) → communication
   (1 PN = 1511/1513; 2 PN = 1515; add DP ⇒ `-3 PN/DP` 1516/1517, `-4` 1518) → safety
   (any safety function ⇒ an **F** CPU) → redundancy (**R**/**H**/**HF**) → motion
   (synchronized/cam/kinematics ⇒ **T/TF**) → custom code/edge (**MFP/ODK**) → PC-based
   (software **1505S/1507S/1508S** or Open Controller).
3. **S7-1200 size & variant** (`CPU-TABLE.md` §1200): 1211C/1212C (very small) → 1214C
   (workhorse) → 1215C (analog out, 2 PN, redundant 24 V) → 1217C (1 MHz differential
   motion); FC models (1212FC/1214FC/1215FC) for machine safety. Then pick the power/
   output variant: **DC/DC/DC** for transistor/high-speed PTO; AC/DC/Relay or DC/DC/Relay
   for slow relay switching (no on-board high-speed pulses).
4. **Assemble the TypeIdentifier**: `OrderNumber:<MLFB>/V<fw>` — forward slash before V,
   never `:V` (known V21 drift bug). Treat MLFB and firmware as **independent axes**.
5. **Always append the resolve note** (step output `resolveNote`) and any capability
   gates. If the need is ambiguous, state the assumption and offer the closest tier up
   and down.

## Hard guarantees

- **No MCP / no TIA.** Selection is offline over the bundled table. The only authoritative
  CPU list at runtime is `GET /catalog`; this skill **recommends a candidate to resolve**,
  it does not instantiate anything.
- **Deterministic decision order.** Same need → same recommendation, with each axis
  justified by the cited decision step.
- **Resolve before build.** Numbers in `CPU-TABLE.md` drift by catalog generation (every
  ⚠ in the reference) — the concrete MLFB + firmware must be confirmed against the live
  installed catalog before `device.create`.
- **Safety stays gated.** Recommending an F-CPU is fine; authoring/modifying/downloading
  F-logic is **never** autonomous (IEC 61511, gate G5) — note this whenever an F-CPU is
  recommended.

See `CPU-TABLE.md` for the families, the MLFB/variant decoder, representative order
numbers, and the full decision criteria.
