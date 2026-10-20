---
name: tia-backup
description: >-
  Back up a PHYSICAL CPU into a dedicated EMPTY project — save+archive the working
  project, create a dated backup project, station-upload (GATE G4) with human approval,
  verify, archive to .zap21. USE WHEN the user asks to "back up / upload / read out the
  CPU" or before risky work on a live controller. Class M-off up to the gate; the upload
  itself is GATE G4 (+G6 if a read password is requested) and NEVER runs without an
  explicit human yes. DO NOT USE to upload into the working project (the upload ADDS a
  station — always a dedicated empty project), to download/deploy to the CPU (a backup
  never writes or stops it; use tia-handoff for downloads), or to invent a read password
  (G6 — it comes from a human).
---

# tia-backup — read a physical CPU into a restorable archive (M-off up to G4)

The upload **adds a new station** to the open project — so the backup always goes into a
**dedicated, dated, EMPTY project**, never the working project. The `.zap21` archive is
the restorable artifact.

## Errors and reporting

- First call `tia_ping`: continue only if it reports `reachable:true` and `activated:true`. `activated:null` with a busy `detail` means a job is still running: poll `tia_job_status` with the `jobId` you hold, or wait and ping again. Otherwise stop, quote its `detail` and `hint` verbatim and say that nothing was changed (prerequisites: `tia_guide {"topic":"gotchas"}`).
- If no `tia_*` tool is available, the `tia` MCP is not connected: say so and stop. Never continue from memory and never work around it with hand-made HTTP calls (they bypass the MCP's gate checks).
- On a tool error (`isError:true`), quote its `error` and `kind` verbatim, relay its `hint`, and state what was done and what was not. Apply only the remedy the hint or this skill names, at most once; otherwise stop and ask.
- Never report success after an error, never retry a refused call with changed arguments, and never cross a human gate: relay a `requires_human_action` answer verbatim and wait for the human.
- `status:"running"` or `kind:"busy"` is not a failure: poll `tia_job_status {jobId}`. After a `timeout`, check the state before repeating anything.

## Preconditions

- The serve is running and G1 (trust dialog) is done.
- The license has the `deploy` scope (`tia_upload`, the G4 step, is deploy-class).
- The CPU's IP is known.
- The PG/PC adapter/mode names: discover them with `tia_pg_interfaces` on the working
  project's PLC **before** switching projects (the adapter list is host-wide), or read them
  from the upload plan's `available` lists.

## Procedure (in order)

0. **Protect the working project.** If `tia_status` shows a project: `tia_project_save`,
   then `tia_project_archive { directory:"<an-existing-folder>",
   name:"<working-project>_<YYYYMMDD-HHmm>.zap21" }` (the directory must already exist;
   the name carries the `.zap21` extension — a missing or extension-less name fails).
   Report the resulting `<directory>/<name>` path. Tell the human the next step
   **closes** it: `tia_project_create` replaces the open project, and `serve` refuses it with
   `unsaved_changes` while that project has unsaved work — which is why the save comes
   first. If the save or the archive fails, STOP and report it: never create the backup
   project over unsaved work.
1. **Create a dedicated EMPTY backup project.** `tia_project_create` in a folder the human
   picks, named `PLC_backup_<station-or-ip>_<YYYYMMDD-HHmm>`. **Create no device in it.**
   The first connect of a new TIA process may raise G1.
   If it answers `unsaved_changes`, the working project changed after the save in step 0:
   STOP and report `details.projects`. Never retry with `saveUnsavedChanges` or
   `discardUnsavedChanges` (a flag would save or lose work the step-0 archive does not
   contain).
2. **`tia_upload` without confirm.** Relay the handoff verbatim. STOP if the project path
   isn't the new backup project or `devices` isn't empty.
3. **After an explicit human yes:** re-call `tia_upload` with the SAME `ip`,
   `connectionMode`, `pcInterfaceName` and `pcInterfaceNumber` shown in the approved plan,
   plus `confirm:true` and that `planHash` (+ `password` only if the human typed it — G6,
   never invented). Changed connection fields invalidate the approval (`plan_mismatch`);
   `ip` is required on every call.
   - `running` → poll `tia_job_status`.
   - `upload_password` → ask the human for the password (G6), then get a fresh confirmation.
   - `outcome_unknown` → check `tia_devices` first; never repeat the call.
4. **Verify.** `createdDevices` / `tia_devices` show the one new station. Optionally
   `tia_plc_blocks` on it and `tia_compile` (M-off; a GUI-gated license message is not a
   backup failure).
5. **Archive.** `tia_project_save` + `tia_project_archive { directory:"<an-existing-folder>",
   name:"PLC_backup_<station-or-ip>_<YYYYMMDD-HHmm>.zap21" }`. The `.zap` is the backup.
   Report its `<directory>/<name>` path, what it contains (expected) and what it doesn't.
6. **Optional:** reopen the working project with `tia_connect` (the human decides). It
   closes the backup project, which step 5 saved; if it answers `unsaved_changes`, STOP and
   report it, and never pass `discardUnsavedChanges`.

## What it captures / does not

- Captures (observed 2026-09-26, S7-1200 1214C): the hardware configuration plus the full
  program — 41 blocks (FB 11, FC 4, OB 1, GlobalDB 8, InstanceDB 17), 4 UDTs, and tags (1
  tag table with 32 tags; the bench project copy holds 2 tag tables, so tag-table structure
  may differ). The uploaded station compiled with 0 errors (1 hardware warning).
- Not covered: this is an **engineering** backup, not a memory-card backup — no
  retentive/actual values, recipes or data logs; know-how-protected content cannot be read
  back (stated as scope, not hardware-tested). An F-program is only reported (G5).

## Runtime status

Runtime status: validated 2026-09-26 on S7-1200 1214C (bench): upload added the station,
CPU stayed in RUN, archive `.zap21` 1.6 MB; G6 password path not hardware-verified.

## Hard guarantees

- **Never the working project.** The tool binds the token to the project shown in the
  handoff; the skill checks path + 0 devices before confirming.
- **G4 needs a human yes.** The upload goes online to the physical CPU — explicit approval
  every time.
- **G6 passwords come from a human only.** Never invented, guessed or reused.
- **F is only reported (G5).** Never authored, modified or deployed.
- **Never repeat after an unknown outcome.** Token spent → check `tia_devices` first.
- **Never download as part of a backup.** A backup reads; it never writes or stops the CPU.
- **Never discard.** `discardUnsavedChanges` is never passed in a backup: an
  `unsaved_changes` refusal is reported to the human, never worked around.
