---
name: tia-verify
description: >-
  Run the offline VERIFICATION LADDER on an open TIA project — rung 1 compile (recurse the
  message tree; only Error blocks), rung 2 consistency + project-as-code export/COMPARE
  (roundtrip proof against the versioned XML), rung 3 simulation (future). Use when the user
  asks to "verify / compile / check the project builds", after tia-scaffold or any authoring
  change, or before tia-handoff (a clean compile is the Gd9 precondition for deploy). Class
  M-off: compiles via the tia MCP; repairs the known bare-CPU protection errors (RECIPES) and
  re-compiles. STOPS at deploy (G3 is gated). Not for a style/architecture audit (tia-review)
  or for downloading (tia-handoff).
---

# tia-verify — the verification ladder, rungs 0–3 (class M-off)

Prove a project "works in practice" offline, the only honest pre-deploy evidence. (The style/architecture audit — naming, UDTs,
optimized access — is `tia-review`.) The
verification ladder (TIA best-practices baseline §12): **rung 0** static (`spec-validate`), **rung 1** compile +
consistency, **rung 2** project-as-code export + COMPARE (roundtrip proof), **rung 3** simulation
(PLCSIM, future). A **clean compile is the precondition (Gd9)** for export *and* download — so
this gate-keeps `tia-handoff`.

## Errors and reporting

- First call `tia_ping`: continue only if it reports `reachable:true` and `activated:true`. `activated:null` with a busy `detail` means a job is still running: poll `tia_job_status` with the `jobId` you hold, or wait and ping again. Otherwise stop, quote its `detail` and `hint` verbatim and say that nothing was changed (prerequisites: `tia_guide {"topic":"gotchas"}`).
- If no `tia_*` tool is available, the `tia` MCP is not connected: say so and stop. Never continue from memory and never work around it with hand-made HTTP calls (they bypass the MCP's gate checks).
- On a tool error (`isError:true`), quote its `error` and `kind` verbatim, relay its `hint`, and state what was done and what was not. Apply only the remedy the hint or this skill names, at most once; otherwise stop and ask.
- Never report success after an error, never retry a refused call with changed arguments, and never cross a human gate: relay a `requires_human_action` answer verbatim and wait for the human.
- `status:"running"` or `kind:"busy"` is not a failure: poll `tia_job_status {jobId}`. After a `timeout`, check the state before repeating anything.

## Preconditions

- A project **open** (`tia_status` → `hasProject:true`). Connecting is G1 — defer to the human.

## Inputs / tools

- `tia_compile` (per CLP) — returns `{ state, errors, warnings, messages[] (tree), blockChanges,
  verification, nextHints }`. `blockChanges` (#28) lists blocks whose fingerprint changed —
  `"modified"`/`"added"`/`"removed"` — since the compile's own before/after snapshot; a
  regenerated instance DB shows up here as `"modified"`.
- `tia_plc_blocks` — `isConsistent` per block (stale ⇒ recompile).
- `tia_export_xml` — export blocks/types to SimaticML for a git diff (bulk, to disk).
- `tia_export_block` — export ONE block inline (no disk) with `sha256`/`normalizedSha256`.
- `tia_block_compare` — **rung 2's real proof**: compares a block in the project against the
  SimaticML you pass (the committed file) — normalized (ignores BOM/formatting/`<Created>`/UIds
  — the result's `ignored` field spells out exactly what) — and returns `verdict: "equal" |
  "different"` (+ the first differing line). A raw hash is NOT proof of equality (two exports
  of the same block differ in `<Created>`); this is.
- Protection repair (when compile shows the bare-CPU errors): `tia_obj_service` +
  `tia_obj_invoke Protect` + `tia_obj_set_attributes` with the access-control variant for the CPU
  family/firmware (S7-1500 V2.9: `PlcProtectionAccessLevel=FullAccess`; S7-1200 V4.7:
  `PlcAccessControlConfiguration=Disabled` on its provider service — see `../tia-scaffold/RECIPES.md`).
- Long tools (`tia_compile`, `tia_export_xml`, `tia_export_block`, `tia_block_compare`) may answer
  `status:"running"` + `jobId`: poll `tia_job_status {jobId}` until the final result — never
  repeat the original call.

## Outputs

- Per CLP: `compiled` = `clean` | `error`, `errors`, `warnings`, and — if errors — the
  **leaf** messages (the real text; recurse the tree, intermediate nodes are empty by design).
- A ladder verdict: which rungs passed (0 static, 1 compile/consistency, 2 export+compare
  roundtrip) and whether deploy (`tia-handoff`) is unblocked.

## Procedure (in order)

1. **Confirm open** (`tia_status`).
2. **Rung 1 — compile** each CLP (`tia_compile`). Interpret: **only `State=Error` blocks**;
   warnings never block (Gd8). The message tree's intermediate nodes have empty descriptions
   — **recurse to the leaves** for the real error text (don't report "3 errors" with no text);
   the result's `located` list, when present, already holds those leaves with their path.
   Read `blockChanges`: any block regenerated by this compile needs rung 2 below.
3. **Auto-repair the known case.** If the errors are the bare-CPU **protection** signature
   (confidential-config password / communication certificate / access level), apply the
   `RECIPES.md` protection recipe (the variant for the CPU family/firmware; the `Protect` password
   comes from the human, never invented) and **re-compile** once. If the same errors remain,
   stop and report the leaf messages. When you ask for the password, tell the human what the recipe changes: the
   access level goes to **Full access** (S7-1500) or access control is **disabled** (S7-1200,
   FW V4.5+), and the CPU keeps that after the next download; name the change in the report.
4. **Consistency.** Confirm `isConsistent` on the blocks (`tia_plc_blocks`); a freshly
   imported block — or an **instance DB whose FB interface changed** — comes back
   inconsistent until compiled. The cure is a **(software-scope) re-compile**, which
   `tia_compile` does and which **regenerates** the instance DB (verified: false→true; also
   visible as `"change":"modified"` in `blockChanges`). Re-run `tia_compile` and re-check;
   only if it still reports inconsistent after a compile, delete the instance DB
   (`tia_block_delete`) and recreate it (`tia_instancedb_create`) once — say that its start
   values are reset — then recompile; if it is still inconsistent, stop and report — never
   reach for `UpdateProgram()` (it does not regenerate and can mark other blocks stale).
5. **Rung 2 — project-as-code, export + COMPARE (roundtrip proof).** `tia_export_xml` to a
   directory for a bulk git diff. Then, for any block `blockChanges` flagged (or any block
   you need proof for), pull the versioned file's content and call `tia_block_compare {plc,
   block, xml:"<the committed file's content>"}` — `verdict:"equal"` is the actual proof the
   project matches what's versioned; `"different"` names the first differing line. Use
   `tia_export_block` when you need the project's current XML inline (e.g. to update the
   committed file) rather than a disk export. Rung 3 (PLCSIM) is **future** — note it, don't
   fake it.
6. **Report + hand off.** If `errors:0` AND rung 2's comparisons are `equal` (or explicitly
   pending human commit), state that **Gd9 is satisfied** → `tia-handoff` may prepare the
   (gated) download. If errors remain, list the leaf messages + fixes; do NOT proceed to
   deploy.

## Hard guarantees

- **Compile-clean gate-keeps deploy (Gd9).** Never let `tia-handoff`/download proceed with
  any `Error`. Warnings are allowed (report them).
- **Recurse the tree.** Real errors live in the leaf `messages`; summarizing only the count
  is a failure of this skill.
- **M-off only.** Compile/export/protection-repair are offline. Download/online (G3/G4) are
  gated and live in `tia-handoff`.
- **Safety.** Never modify F-logic to "make it compile" (G5); report and defer to the human.
