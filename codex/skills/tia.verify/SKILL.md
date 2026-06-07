---
name: tia.verify
description: >-
  Run the offline VERIFICATION LADDER on an open TIA project — rung 1 compile (recurse the
  message tree; only Error blocks), rung 2 consistency + project-as-code export/diff, rung 3
  simulation (future). USE WHEN the user asks to "verify / compile / check the project
  builds", after tia.scaffold or any authoring change, or before tia.handoff (a clean compile
  is the Gd9 precondition for deploy). Class M-off: compiles via the tia MCP; repairs the
  known bare-CPU protection errors (RECIPES) and re-compiles. DO NOT USE to download/deploy
  or go online (that is gated G3/G4 → use tia.handoff), to build a project from a spec (use
  tia.scaffold), or to "make F-logic compile" (G5 — report and defer to the human).
---

# tia.verify — the verification ladder, rungs 0–3 (class M-off)

Prove a project "works in practice" offline, the only honest pre-deploy evidence. The
verification ladder (TIA best-practices baseline §12): **rung 0** static (`spec.validate`), **rung 1** compile +
consistency, **rung 2** project-as-code diff, **rung 3** simulation (PLCSIM, future). A
**clean compile is the precondition (Gd9)** for export *and* download — so this gate-keeps
`tia.handoff`.

## Preconditions

- A project **open** (`tia_status` → `hasProject:true`). Connecting is G1 — defer to the human.

## Inputs / tools

- `tia_compile` (per CLP) — returns `{ state, errors, warnings, messages[] (tree), verification, nextHints }`.
- `tia_plc_blocks` — `isConsistent` per block (stale ⇒ recompile).
- `tia_export_xml` — rung 2: export blocks/types to SimaticML for a git diff (round-trip proof).
- Protection repair (when compile shows the bare-CPU errors): `tia_obj_service` +
  `tia_obj_invoke Protect` + `tia_obj_set_attributes PlcProtectionAccessLevel=FullAccess`
  (see `../tia.scaffold/RECIPES.md`).

## Outputs

- Per CLP: `compiled` = `clean` | `error`, `errors`, `warnings`, and — if errors — the
  **leaf** messages (the real text; recurse the tree, intermediate nodes are empty by design).
- A ladder verdict: which rungs passed (0 static, 1 compile/consistency, 2 export-diff) and
  whether deploy (`tia.handoff`) is unblocked.

## Procedure (in order)

1. **Confirm open** (`tia_status`).
2. **Rung 1 — compile** each CLP (`tia_compile`). Interpret: **only `State=Error` blocks**;
   warnings never block (Gd8). The message tree's intermediate nodes have empty descriptions
   — **recurse to the leaves** for the real error text (don't report "3 errors" with no text).
3. **Auto-repair the known case.** If the errors are the bare-CPU **protection** signature
   (confidential-config password / communication certificate / access level), apply the
   `RECIPES.md` protection recipe and **re-compile**. Re-run is idempotent.
4. **Consistency.** Confirm `isConsistent` on the blocks (`tia_plc_blocks`); a freshly
   imported block — or an **instance DB whose FB interface changed** — comes back
   inconsistent until compiled. The cure is a **(software-scope) re-compile**, which
   `tia_compile` does and which **regenerates** the instance DB (verified: false→true).
   Re-run `tia_compile` and re-check; never delete/recreate the instance DB, and never
   reach for `UpdateProgram()` (it does not regenerate and can mark other blocks stale).
5. **Rung 2 (optional) — project-as-code.** `tia_export_xml` to a directory for a git diff /
   round-trip proof. Rung 3 (PLCSIM) is **future** — note it, don't fake it.
6. **Report + hand off.** If `errors:0`, state that **Gd9 is satisfied** → `tia.handoff` may
   prepare the (gated) download. If errors remain, list the leaf messages + fixes; do NOT
   proceed to deploy.

## Hard guarantees

- **Compile-clean gate-keeps deploy (Gd9).** Never let `tia.handoff`/download proceed with
  any `Error`. Warnings are allowed (report them).
- **Recurse the tree.** Real errors live in the leaf `messages`; summarizing only the count
  is a failure of this skill.
- **M-off only.** Compile/export/protection-repair are offline. Download/online (G3/G4) are
  gated and live in `tia.handoff`.
- **Safety.** Never modify F-logic to "make it compile" (G5); report and defer to the human.
