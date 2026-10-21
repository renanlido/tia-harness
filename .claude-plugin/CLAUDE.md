<!-- GENERATED from mcp/content/ (run: cd mcp && npm run sync) — do not edit by hand -->

# TIA Openness MCP — operating brief

You are driving Siemens TIA Portal V21 through the `tia_*` tools (an MCP over the TIA
Openness HTTP `serve`). This brief is ALWAYS in effect. For depth, call the `tia_guide`
tool (topics: `gates-guards`, `gui-gates`, `gotchas`, `pipeline`, `recipes`,
`spec-format`) — read the relevant topic BEFORE authoring blocks, changing hardware,
or preparing a deploy. You are an assistant up to the gate, never an autonomous
commissioner.

## Vocabulary (used across all tool descriptions)

- **Class R** — read-only; safe anytime.
- **Class M-off** — offline mutation (edits the project; never touches the physical PLC).
- **Class GATE** — touches the physical world or a human-only decision; needs a human.
- **G1..G7** — the GATES: G1 trust dialog, G2 S7-connection precondition (tool-enforced:
  both CPUs must compile clean), G3 download / CPU-STOP, G4 go-online (incl. station upload),
  G5 safety / F-logic (NEVER autonomous), G6 credentials — master secret, UMAC, upload /
  block / certificate passwords, password policy (from a human — never invented), G7 network
  scan. All except G2 are human-only — never crossed autonomously.
- **Gd\*** — tool-enforced GUARDS (preconditions the tools check), e.g. Gd5
  `OrderNumber:<MLFB>/V<fw>` format (slash before V, never `:V`), Gd8 only ERRORs block
  a compile (warnings don't), Gd9 clean compile before deploy, Gd11 dryRun-then-approve.

## Non-negotiable rules

1. **Serial only.** The serve owns ONE TIA Portal on ONE serial worker. Never fire
   concurrent `tia_*` calls; one hung Openness call can stall the whole serve.
2. **Never cross a GATE autonomously.** A `requires_human_action` response is a HANDOFF,
   not an error: relay its `youMustDo`/`nextSteps` to the human verbatim, wait for their
   explicit yes, then resume exactly as instructed. Never self-approve a download; never
   invent a secret (G6); never author, modify or deploy safety/F logic (G5).
3. **Long operations are jobs.** A tool whose description says "Long operation" (connect,
   compile, download, upload, project create/save/archive, exports, CAx…) may answer `status:"running"` with a
   `jobId` — the operation is STILL running on serve. Call `tia_job_status {jobId}`
   until it returns the final result; never repeat the original call. While a job runs,
   any OTHER ordinary serve-bound tool answers `kind:"busy"` (with `details.jobId`) — that is
   expected, not a failure: go back to `tia_job_status`. `tia_ping` probes `/health`: never busy,
   `activated:null` while a job runs, and no job ID in it — use it for reachability only. Offline
   tools (`tia_guide`, `tia_spec_validate`, `tia_spec_plan`, `tia_job_status` itself) never answer busy.
4. **Compile before deploy.** `tia_compile` aggregates hardware + software and is the
   offline verifier: `errors:0` is the Gd9 precondition for download (G3) and for S7
   connections.
5. **Follow the build pipeline order** (details: `tia_guide {"topic":"pipeline"}`):
   validate the spec (`tia_spec_validate`) → plan (`tia_spec_plan`) → scaffold
   (`tia_spec_apply` or the M-off tools) → verify (`tia_compile`) → human-gated deploy
   (`tia_download` with dryRun → human approval → `approved:true` + the same `planHash`).
6. **Some CPU settings are GUI-only** (PUT/GET permission, OPC UA runtime license,
   OPC UA server interface). Hitting one is EXPECTED, not a bug: relay the exact GUI
   steps from `tia_guide {"topic":"gui-gates"}` and resume after the human confirms.
7. **Prerequisites:** the serve must be running (default `http://localhost:5000` —
   check with `tia_ping`); the FIRST connect per serve process hits the G1 trust dialog
   on the serve host.
8. **Confirmation dialogs.** Where the client supports it, a gated call first asks the human in the client's dialog
   (elicitation); only the human answers it, and it never replaces dryRun → approval → `planHash`. `declined_by_human` /
   `cancelled_by_human` = refused, nothing sent: stop, no retry unless asked.
9. **Size budget and paging.** A result holding `{"omitted":true,…}` had that value cut out WHOLE by the MCP's size budget:
   repeating the same call returns the same marker, so follow its `hint` instead. Read large lists (`tia_plc_blocks`,
   `tia_plc_tags`, `tia_device_tree`) in pages: pass `limit`, then each `nextCursor` as `cursor` until it is `null`. A page
   with a marker has NO `nextCursor` (it would skip the omitted data): retry the same request with a smaller `limit`.
   `cursor_stale` means the project changed: restart from the first page (no `cursor`). Gate handoffs, plans and job
   envelopes are never cut. For XML too big for one result use `tia_export_xml` (it writes files on the serve host).

Session start: `tia_ping` → `tia_status` → (if needed) `tia_start` / `tia_connect`.
Before the first build on a project: read `tia_guide {"topic":"pipeline"}` and
`tia_guide {"topic":"gotchas"}`.

**Tool names** are written bare (`tia_status`) here and in the skills. Claude Code shows them qualified:
`mcp__plugin_tia-harness_tia__tia_status` (plugin; what a subagent `tools:` list needs) or
`mcp__tia__tia_status` (standalone). Other clients may display them differently; the `tia_*` suffix
is the tool.

---

# Gates vs guards

## GATES vs GUARDS

- **GATES (human-only — never auto-bypass):** trust dialog (**G1**), download / CPU-STOP
  (**G3**), go-online (**G4**, which includes a **station upload** (`tia_upload`): it goes
  online to read the CPU), network scan / accessible-devices (**G7**), master-secret/UMAC
  (**G6**, which includes a CPU **read-access password** for an upload, a block **know-how
  password** (`tia_block_protect`), a certificate file's password (`tia_certificate_import`)
  and the **password-policy** values (`tia_password_policy_set`)), **safety / F-logic
  (G5) — never autonomous**.
- **GUARDS (tool-enforced preconditions):** compile-clean before deploy, consistency,
  dry-run→approve, idempotency by name (advisory: re-runs do not converge), `OrderNumber:<MLFB>/V<fw>`
  format, serial-only.
- Back up a physical CPU with the **`tia-backup`** skill (dedicated empty project; the upload
  token is bound to the project shown in the handoff).
- **Picking the G3 download path (no gate, no scan):** `tia_pg_interfaces` lists the connection
  modes/PG-PC interfaces TIA already sees for the CPU (plus the OS status of each adapter) —
  use it to fill `connectionMode`/`pcInterfaceName`/`targetInterfaceName` for `tia_download`
  instead of reaching for `tia_accessible_devices` (a real network scan, GATE G7).
- **GUI-ONLY settings (NOT exposed via Openness — surface as a human gate, do not script):**
  "Permit access with PUT/GET communication", OPC UA **runtime license** / server-interface
  creation. (OPC UA server **activation** is the exception — settable via Openness with
  `tia_obj_set_attributes {handle, attributes:{OpcUaServer:true}}` on the "OPC UA" device-item.)

**Deploy-time approval gates** (download / online / network-scan / secret / safety = **G3/G4/G7/G6/G5**)
are a *different* class — see the **`tia-handoff`** skill. Those are "a human **approves an action**",
not "a human **clicks a GUI setting**". Both are human interaction points; surface them as
`requires_human_action` with concrete guidance, never as a tool failure.

---

# GUI gates — expected human interaction points

## Human interaction points (GUI gates) — EXPECTED, not an error

Some TIA settings are **not reachable via Openness** on the S7-1200/1500. The harness will hit a
signal that *looks* like an error but is actually a point where a **human must act in the TIA GUI**.
When you see one of these, **do not treat it as a failure and do not retry blindly** — recognize it,
tell the human the **exact GUI steps**, and resume after they confirm. A GUI gate is a *handoff*, not a *bug*.

| # | Signal you'll see | Why it's expected | Tell the human (exact GUI steps) |
|---|---|---|---|
| **G1 trust** | `tia_connect` → `requires_human_action` (`trust_dialog`), or the **1st** TIA-starting call per `serve` process goes **~180 s** (`TIA_CONNECT_TIMEOUT_MS`) without an answer — `tia_connect`, `tia_start`, `tia_show_ui` and `tia_project_create` all share that wait, and a client timeout with `/health` alive yields the same `trust_dialog` handoff. A `running` answer from any of them can still mean a trust dialog is waiting on the serve host | TIA shows a one-time security prompt the first time an Openness app attaches, **per process** | On the **serve host**, in TIA Portal, click **"Yes to all"** in the access dialog. *Caveat:* it can false-positive on a client timeout with **no** real dialog — check `tia_status` (**`hasProject:true`**, not `attached:true`) and… If the handoff state is `TRUST_DIALOG_DENIED_OR_EXPIRED`, the dialog was denied or left to expire: the serve lists what it closed (`closedPids`), what is still running (`stillRunningPids`) and what it could not confirm (`unknownPids`) — close any still-running TIA (no project inside) before re-calling, and for an unconfirmed pid first verify in Task Manager that it is a TIA Portal started by this serve with no open project, with a human ready to click **"Yes to all"**. |
| **OPC UA license** | `tia_compile` **ERROR**: *"The selected OPC UA license is not sufficient…"* | License selection is GUI-only (no Openness service); a fresh project **or a firmware change** leaves it unset | CPU → **Properties → General → Runtime licenses → OPC UA** → *Type of required license* → select **"SIMATIC OPC UA S7-1200 Basic"** (the 1214C option), and *Type of purchased license* → the license the CPU holds (the human declares it; left at "No license" the compile still reports *"Type of purchased license: The selected OPC UA license is not sufficient"*). Recompile. |
| **OPC UA interface** | OPC UA client connects but the DB nodes aren't there (`ns=4` empty / no `ServerInterfaces`) | The **S7-1200 does NOT auto-expose DBs** (unlike the S7-1500) — a server interface must be created by hand | CPU → **OPC UA → Server interfaces → Add new server interface** → add/drag the DB (e.g. `ModbusData`) into it. Recompile; data appears under `ns=4`. |
| **PUT/GET** | S7 client (`nodes7`/`snap7`) connects on port 102 but reads return access-denied (`ROSCTR=2` / "BAD") | *"Permit access with PUT/GET"* is a GUI-only protection setting | CPU → **Properties → Protection & Security → Connection mechanisms** → check **"Permit access with PUT/GET communication from remote partner"**. Compile + download (`hardware:true`). |
| **FW-change reset** | After `tia_device_change_version`: OPC UA server off, the license error on compile, blocks `isConsistent:false` | `DeviceItem.ChangeType` **resets GUI-gated comm settings** (server activation + license); the interface & PUT/GET survive | `tia_project_archive` **before** the FW change. After: re-set `OpcUaServer:true` via `tia_obj_set_attributes` (scriptable), re-select the license (row above), recompile. |

**Not a gate (now scriptable):** *activating* the OPC UA server — `tia_obj_set_attributes {handle, attributes:{OpcUaServer:true}}`
on the "OPC UA" device-item (it auto-generates the server certificate). Only the **license** and the
**server interface** stay GUI-only.

---

# Hard-won gotchas (runtime-validated)

## Hard-won gotchas

1. **Always compile before deploy.** `tia_compile` aggregates **hardware + software**; a
   **clean** compile (`errors:0`) is the precondition for download and for S7 connections.
2. **The serve is a SINGLE serial worker** — one Openness op at a time. Do **not** fire
   concurrent `tia_*` calls; a hung Openness op can stall the serve (may need a restart).
3. **Changing an FB's interface (e.g. regenerating it via `tia_source_put`) leaves its
   instance DB inconsistent.** Recompile FIRST: a software-scope `tia_compile` regenerates
   the instance DB in most cases — read the compile result's **`blockChanges`** (`tia_compile`
   and `tia_source_put {compile:true}` both return it): a `"change":"modified"` entry on the
   instance DB is your confirmation it was regenerated — **export and commit it**
   (`tia_export_block`/`tia_block_compare`) so what's versioned matches the project. Only if
   the DB still reports inconsistent after a compile, delete it (`tia_block_delete`),
   recreate it (`tia_instancedb_create`) and recompile.
4. **Firmware rule: project FW ≤ device FW.** Bump the project FW **in-place** with
   `tia_device_change_version` (`DeviceItem.ChangeType`), which preserves the **program** — never
   set the project higher than the physical CPU. **⚠️ It RESETS GUI-gated comm settings** (the
   **OPC UA server activation** + **runtime-license**; the server interface and PUT/GET survive):
   **archive first** (`tia_project_archive`) on a CPU with hand-configured OPC UA, recompile after
   (it marks blocks inconsistent), and re-verify. Same-version `ChangeType` is rejected.
5. **Use a NON-optimized DB** for Modbus (`MB_HOLD_REG`) and S7 (absolute addressing); OPC UA
   works with optimized or not.
6. **Order numbers use `/V<fw>`, not `:V<fw>`** (guard Gd5).
7. **A station upload (`tia_upload`) ADDS a new station to the open project — back up into a
   dedicated EMPTY project.** Observed on hardware (S7-1200 1214C, 2026-09-26): the upload read
   the CPU into an empty project (0 → 1 device, twice) in ~75 s (76.7 s and 74.2 s); the CPU
   stayed in RUN the whole time (owner watching its LEDs during the second upload). Protect the
   working project FIRST: `tia_project_create` closes the current project, and serve refuses it
   (`409 unsaved_changes`) while that project has unsaved changes — so `tia_project_save` +
   `tia_project_archive` before creating the backup project (never pass `discardUnsavedChanges` to
   get past the refusal) — and pass the archive `name` WITH the `.zap21` extension (`name` absent
   or extension-less fails; with `.zap21` it archived 1.6 MB).
8. **One wrong know-how password can lock a block for the session.** Observed on the bench
   (2026-10-12): after one rejected unprotect (`tia_block_protect {protect:false}`), TIA refused
   the CORRECT password of that block for the rest of the session (cause not confirmed — possibly
   brute-force protection). Never retry with a guess — ask the human for the password (G6); if a
   password the human confirms is refused, stop and hand off instead of retrying.
9. **`unsaved_changes` and `binding_conflict` are refusals, not faults: nothing was changed.**
   `tia_connect`, `tia_project_close`, `tia_disconnect` and `tia_project_create` answer
   `409 unsaved_changes` when the call would close a project with unsaved changes (the error lists
   each one). ASK the human; the recommended answer is to repeat the same call with
   `saveUnsavedChanges:true`. Pass `discardUnsavedChanges:true` (data loss) ONLY when the human
   explicitly decides to throw the work away, never to make the error go away (the client then asks
   the human to confirm in its own dialog; `declined_by_human` = nothing was sent, stop).
   `409 binding_conflict` means the project this session is bound to is no longer the one open in
   the bound TIA (closed, replaced or Save As done by hand; `tia_status` shows `boundProjectPath`
   and `bindingDrift`): ask the human which project is intended, then `tia_connect` with the bound
   path (back to it) or the open one (adopt it) — do not repeat the refused call first.
10. **`503 audit_unavailable`: the serve could not write its audit log, so it refused the call BEFORE
   running (nothing reached the PLC).** Have the human fix the disk or permissions, then re-plan.
   An `auditWarning` in a response = the call ran but was not fully recorded: report it.

## Prerequisites (environment)

- The **`tia` serve must be running** (default `http://localhost:5000`, e.g.
  `TIAOpenness.exe serve 5000`). The MCP is a pure HTTP client; point it at the serve host via
  `TIA_API_BASE` if it runs elsewhere.
- The Windows user must belong to the **"Siemens TIA Openness"** local group.
- The **FIRST connection per serve process shows a trust dialog** that a **human must confirm**
  ("Yes to all") on the serve host — this **cannot be automated** (gate G1).

---

# The build pipeline (spec → verified project)

Stages in order — the class tells you what each stage may do:

| # | Stage | Tool(s) | Class | What it does |
|---|---|---|---|---|
| 0 | Validate the spec | `tia_spec_validate` | R (pure) | Partial shape checks + the cross-field rules the tool implements: unique names, IP inside the subnet CIDR, Gd5 order-number format, no STL/GRAPH on S7-1200, the G5 safety rule, at most 8 SMs on an S7-1200. It does NOT run the JSON Schema or per-model module limits; the `spec-validate` skill covers both. Needs no serve. |
| 1 | Plan | `tia_spec_plan` | R (pure) | Turns a VALID spec into the ordered list of M-off operations. Nothing mutates. |
| 2 | Scaffold | `tia_spec_apply` (or the M-off tools manually) | M-off | Creates part of the project content in dependency order (scope below). Stops at every gate. |
| 3 | Verify | `tia_compile` | M-off | THE offline verifier: aggregates hardware + software. Gd8: only ERRORs block. `errors:0` is the Gd9 precondition for any deploy. |
| 4 | Handoff / deploy | `tia_download` | GATE G3 | `dryRun:true` asks serve for a VERIFIED plan (clean compile, resolved connection, software fingerprint) → plan + `planHash` → a HUMAN approves → re-call with `approved:true` + the SAME `planHash` (serve re-checks the fingerprint and refuses `plan_stale` if the software changed). The approval covers the connection/options and the covered software content — NOT the hardware configuration (a hardware change after approval passes the token check). Re-plan (new dryRun) + fresh human approval only when the hardware configuration changed AFTER the dryRun that produced the token — the fingerprint cannot detect that change, so the human must confirm nothing hardware-side moved; never reuse the old token for changed hardware. The fingerprint covers only user program blocks, UDTs and tag tables (what it leaves out, the `source:"dates"` fallback: `tia_guide {"topic":"recipes"}`, 'Reference — download plan fingerprint limits'). Never self-approve. Pick the connection with `tia_pg_interfaces` (no scan). |

Scaffold order (UDTs BEFORE the blocks that use them): by hand, `tia_guide {"topic":"recipes"}`, 'Pipeline order'. `tia_spec_apply` automates only subnets, devices, modules, network, tag tables, tags, FB shells, control-module instance DBs and the compile; protection, constants, UDTs and all logic stay manual. The FB shells it creates are empty: add their logic with `tia_source_put` (SCL) or `tia_import_xml` (LAD/FBD).

PLC-scoped steps use the PlcSoftware (e.g. `PLC_1`) read after the device step, not the device name.

## The approval envelope (what a gate handoff looks like)

Gated tools return `status:"requires_human_action"` with:

- `gate` — which gate (e.g. `download_approval`, `station_upload`, `go_online`, `trust_dialog`);
- `youMustDo` — what the human must confirm, in plain words;
- `plan` + `planHash` — exactly what would be executed (the hash binds the approval to
  this exact plan; a changed plan needs a new approval); the download's plan also carries
  `fingerprint` (the software content the plan was verified against — show it too);
- `nextSteps` — how to resume after the human's yes.

Relay the envelope to the human, wait for an explicit yes, resume exactly as
instructed. The AI never approves, never invents a secret, never deploys F-logic.

**Confirmation dialog.** When the client supports elicitation, the crossing calls (`tia_download` with
`approved:true`; `tia_upload`, `tia_online`, `tia_accessible_devices` with `confirm:true`) first ask the
human in a dialog; clients without it behave as before. The dialog only checks the human's answer: the
`planHash` and serve's approval token stay the authority.
Passwords (G6) are never asked there. `declined_by_human` / `cancelled_by_human` = the human refused:
nothing was sent, no retry unless asked. `elicitation_failed` (`isError`) = the dialog could not be
shown or answered, nothing was sent (fails closed).

## After scaffolding

- Re-run `tia_compile` after ANY authoring change.
- `tia_project_save` regularly; `tia_project_archive` BEFORE risky operations
  (firmware change — see `tia_guide {"topic":"gotchas"}`).
- Auditing an existing project is class R (`tia_plc_*` reads); baseline: `tia_guide {"topic":"recipes"}`, 'Reference — network, audit and CAx how-to'.
- `tia_crossrefs` (class R, a long read: it may answer `status:"running"` + `jobId`, then poll
  `tia_job_status`) reads the cross-references: in an audit, `filter:"UnusedObjects"` lists
  unused-object CANDIDATES, never proof (OBs, objects used only from outside the PLC such as an
  HMI, OPC UA or another CPU, and library TYPEs show as unreferenced); before changing an
  existing object, `target` + `kind` + `filter:"ObjectsWithReferences"` returns the objects related
  to it with each `referenceType` and `access` as TIA reports them (the direction of `Uses` /
  `UsedBy` is not interpreted: the human confirms it). Page a whole-PLC or container read with `limit`
  (for example 200) and `cursor` (the `nextCursor` of the previous page, until it is null; on
  `cursor_stale` restart from the first page, and on an omission marker repeat the same request
  with a smaller `limit`, never following a cursor from an omitted page); each page re-reads the
  whole PLC, so a later page can report less than an earlier one. Read `coverage` on every page,
  not only the first, and compare its counts across pages: differing counts restart the walk once
  from the first page (like `cursor_stale`). Only a finished walk whose pages all report
  `coverage.complete: true` supports "audited completely" or "nothing uses this"; an omission
  marker, an unfinished walk, differing counts or `coverage.complete: false` on any page (see
  `coverage.unavailableOwners`) means the result is NOT complete.
- **FAT/SAT I/O list** (`tia-verify` step 6): `tia_io_map`; recipe: `tia_guide {"topic":"recipes"}`, 'Recipe — generate the FAT/SAT I/O list'.
- **Prove the project matches what's versioned** (a raw hash is NOT proof): `tia_guide {"topic":"recipes"}`, 'Recipe — prove the project matches the versioned XML'.

## Network lifecycle (subnets, PROFINET names, IO systems)

Read first (`tia_subnet_get`, `tia_device_network`, `tia_io_systems`), then run each write's `dryRun` (answered by
the serve, needs an open project). Order, PROFINET names, `disconnectNodes`: `tia_guide {"topic":"recipes"}`, 'Reference — network, audit and CAx how-to'.

- **Refused, nothing changed:** `tia_subnet_delete` of a non-empty subnet (`409 subnet_not_empty`);
  `tia_io_system_connect` across subnets (`409 cross_subnet_assignment`: `tia_network_connect` the device to that subnet first).
- **`409 postcheck_failed`:** the write did not take effect as asked: re-read, never repeat blindly.

## Libraries, HMI, CAx and PLC security

Reads are class R; every change is class M-off (offline, with `dryRun`) and reaches the CPU
only through a later `tia_compile` + human-gated `tia_download` (G3). Every file path is a
path ON THE SERVE HOST.

- **Guarded PLC writes** (`tia_tag_update`, `tia_constant_update`, `tia_constant_delete`,
  `tia_tagtable_delete`, `tia_block_group_delete`, `tia_ob_create`, `tia_block_compile`): the serve
  answers their `dryRun` (it needs an open project) with the guard verdict (name collision, default
  tag table, non-empty group, singleton OB).
- **Project library:** `tia_library_mastercopies` / `tia_library_types` read it;
  `tia_library_mastercopy_create` turns a DEVICE into a master copy (a block cannot be a source);
  `tia_block_from_mastercopy` needs one that holds PLC blocks.
- **Global libraries** (in the TIA Portal session, not the project): `tia_global_libraries`,
  `tia_global_library_create` / `_open` / `_save` / `_close`; save/close take the name from
  `tia_global_libraries` (exact name first, then ignoring case). REFUSED, nothing saved or closed
  (`404 not_found` / `409 conflict`): a name that picks no single open USER library (unknown, read-only
  system/corporate, several matches ignoring case) and a save of a `readWrite:false` library. Up to app
  1.6.3 an unknown name can report success without saving or closing anything: check `tia_global_libraries`.
- **HMI:** `tia_hmis` and `tia_hmi_screens` read any HMI; screen files
  (`tia_hmi_screen_export`, `tia_hmi_screens_import`) work for WinCC **Classic** only, and the
  import OVERWRITES same-named screens.
- **CAx (AutomationML):** `tia_cax_export` / `tia_cax_import` (scope, `option` values: recipes). Archive the
  project before an overwrite. A failed transfer is an error after app 1.6.3; on an older serve check the
  devices with `tia_devices`.
- **Error contracts by app version:** `tia_guide {"topic":"recipes"}`, 'Reference — global library and CAx error contracts (by app version)'.
- **PLC security:** `tia_certificates` / `tia_certificate_template` / `tia_password_policy`
  read; `tia_certificate_import` / `_export` / `_delete`, `tia_password_policy_set` and
  `tia_block_protect` change the project. **G6:** a block or certificate password and the
  password-policy values come from a HUMAN — never invent, guess or reuse one; dryRun plans
  show a password as `[redacted]`. A CPU without the certificate manager or a policy service
  answers 409.
- **Multiuser:** `tia_project_servers`, `tia_server_projects` read Project Servers; `tia_local_session_open` needs NO open project (`tia_project_close`, `tia_start`). Nothing is ever checked in.

---

# Recipes (runtime-verified) & scaffold order

## Pipeline order (dependency-correct)

`tia_spec_apply` automates only steps 1-4, the tag tables and tags of 6, the FB shells and control-module instance DBs of 8, and the compile of 9. Protection (5), constants (6), UDTs (7), OB/FC/DB blocks and all block logic stay manual: declaring `dataTypes` in the spec imports nothing. The FB shells of 8 are empty: their logic is step 8 by hand.

1. **Subnets** (`tia_subnet_create`) — before connecting devices to them.
2. **Devices** (`tia_device_create`, `OrderNumber:<MLFB>/V<fw>`) — CPUs first.
3. **Modules** (`tia_device_plug`) — into existing devices, by slot.
4. **Network** (`tia_network_connect`, IP, `createIoSystem`) — CPU + its IO-devices on the
   **same** subnet; exactly one `createIoSystem` per IO-system.
5. **Protection recipe** (below) — so the CPU can compile clean.
6. **Tag tables** (`tia_tagtable_create`) → **tags** (`tia_tag_create`) → **constants**.
7. **UDTs first** (`tia_types_import`), **then** blocks that use them.
8. **Blocks** — the FB comes with its logic: `tia_source_put` (SCL) or `tia_import_xml` (LAD/FBD/GRAPH), Gd6 format
   routing (`tia_fb_create` only makes an empty FB shell); then its instance DB (`tia_instancedb_create`).
9. **Compile** (`tia_compile`) — the verifier; only `Error` blocks. It compiles the **software**
   scope (not just the CPU device item), so it makes freshly-generated blocks consistent and, in
   most cases, **regenerates** any instance DB left inconsistent by an FB interface change.
   **Recompile first**; only if the DB still reports inconsistent after a compile, delete it
   (`tia_block_delete`), recreate it (`tia_instancedb_create`) and recompile.

**The PlcSoftware name.** TIA names the PlcSoftware of a CPU created through `tia_device_create` or `tia_spec_apply` after the CPU device item (default `PLC_1`), not the device, so `plc` in steps 6-9 is the name from `tia_plcs`. The spec plan carries `{plc}`; `tia_spec_apply` resolves it after the device step (`plc.resolve` in `applied`) and stops with kind `plc_unresolved` rather than guess. `devices[].plcName` names the CPU item.

## Recipe — edit an existing block or type without overwriting a newer change (stale-write guard)

Read it with `tia_export_block` (block) or `tia_export_type` / `tia_type_source` (type) and keep its `contentHash`: `contentHash`, `normalizedSha256` and `sha256` are different hash contracts over different normalizations, so never substitute one for another and pass only the `contentHash` of a fresh read as `expectedContentHash`. Edit, then write it back with `tia_import_xml`, `tia_source_put` or `tia_types_import` passing `expectedContentHash:<that contentHash>` (one object per write); on `state_changed` NOTHING was written — re-read, merge your edit onto the current content and retry with the new `contentHash`; a guarded write never compiles, so a block that is not consistent is refused with `409 inconsistent` (NOTHING written) — `tia_compile`, re-read with `tia_export_block` for the current `contentHash`, retry; an object whose current export is not well-formed XML has no hash (its read answers `contentHashError` instead of `contentHash`) and a guarded write over it is refused with `409 unverifiable` (NOTHING written) — repair or re-export it in TIA Portal, or retry WITHOUT `expectedContentHash` (an unguarded write); a verified write returns `contentGuard`.

## Recipe — unlock a freshly-created CPU so it compiles clean (VERIFIED V21, firmware-dependent)

A bare CPU added via Openness may fail `compile` with **protection** errors: the
*confidential-PLC-configuration-data* password is unset, the *communication certificate*
can't be generated without it, and (on newer firmware) the *access control* defaults to a
protected level needing a password. **The recipe differs by CPU family/firmware — there is
no single universal form.** Fix, in order:

**Tell the human first.** The recipe lowers the CPU's protection in the project: it sets the
confidential-configuration password (typed by the human) and then either sets the access level
to **Full access** (S7-1500) or turns access control **off** (S7-1200, FW V4.5+). The CPU runs
with that protection after the next download. Name these changes when you ask for the password
and list them in the report; the human may pick a stricter level in the TIA GUI before deploying.

**(1) Confidential-data password → also auto-generates the certificate** (common to both
families):

```
# find the CPU device-item handle:
tia_obj_roots                                  -> the device handle (role:"device")
tia_obj_items { handle:<device>, composition:"DeviceItems" }   -> the CPU item handle
# acquire the service ON THE CPU MODULE (not the rack) and invoke Protect:
tia_obj_service  { handle:<cpu>, type:"Siemens.Engineering.HW.Features.PlcMasterSecretConfigurator" }  -> <svc>
tia_obj_invoke   { handle:<svc>, name:"Protect", args:["<password>"] }
```

**(2) Clear the access-control error — pick the variant for the CPU's family/firmware:**

- **S7-1500 V2.9** (verified 2026 on real hardware — a 1516-3 V2.9, 3 errors → 0): set
  `PlcProtectionAccessLevel = "FullAccess"` **on the CPU device item**:

  ```
  tia_obj_set_attributes { handle:<cpu>, attributes:{ "PlcProtectionAccessLevel":"FullAccess" } }
  ```

- **S7-1200 V4.7** (new security model, FW ≳ V4.5; per `docs/HARNESS-KNOWLEDGE.md` §2,
  runtime-observed): set `PlcAccessControlConfiguration = "Disabled"` on the
  **`PlcAccessControlConfigurationProvider`** SERVICE — not a direct attribute on the CPU
  item:

  ```
  tia_obj_service        { handle:<cpu>, type:"Siemens.Engineering.HW.Features.PlcAccessControlConfigurationProvider" }  -> <svc2>
  tia_obj_set_attributes { handle:<svc2>, attributes:{ "PlcAccessControlConfiguration":"Disabled" } }
  ```

  ⚠️ **The two variants are mutually exclusive — the wrong one returns HTTP 500 on the
  other family:** `PlcAccessControlConfiguration` isn't on a 1500's CPU item, and
  `PlcProtectionAccessLevel` isn't the right model on a 1200 V4.7 item. Detect the
  family/FW — or the compile-error signature — before picking a variant.

- **S7-1200 V4.0** (old security model): nothing to do here — the same bare-CPU condition
  is only a **WARNING**, not an error; a plain `tia_compile` already returns `errors: 0`.

Then `tia_compile` → `state: Warning, errors: 0` (any remaining warnings — e.g. CPU-display
password — are benign and do **not** block; Gd8).

> **Requires the `tia_obj_service` tool** (acquire `GetService<T>` → handle) for step 1 and
> for the S7-1200 V4.7 variant of step 2. Without it the MCP cannot run either.

### Policy — who supplies the confidential password

`Protect()` sets an **offline project** password (it is not the online master secret / G6), but
it protects confidential configuration data, so **the human supplies it, every time** (the
recommended policy, pending the product owner's confirmation): the project-spec has no field
for it, and a skill never invents, defaults, stores or logs it. The online master secret (`tia_mastersecret_set`, G6) is **always**
human-supplied too.

## S7 connection precondition (G2)

`tia_connection_create` needs **≥ 2 CONSISTENT CPUs** (both compile clean). Two *bare* CPUs
never form a valid S7 connection — apply the protection recipe + `tia_compile` to make each
consistent first, then create the connection. Use `tia_connections_diagnose` on failure.

## Recipe — bump the project firmware **in-place** (keeps the program) (VERIFIED, V21 / S7-1200 1214C)

Bumped a project **V4.0 → V4.4** on a real S7-1200 1214C **without losing blocks or tags**
(verified 2026-06-07). Use this for **auto-FW-match**: align the project to the firmware
actually read from the CPU. `DeviceItem.ChangeType(typeIdentifier)` changes the item type
in place and **preserves the software** — it does **not** require delete/recreate.

```
# archive first (see the warning below), then change the CPU's type to the SAME MLFB with the target /V<fw>:
tia_device_change_version { plc:"<plc>", typeIdentifier:"OrderNumber:6ES7 214-1HG40-0XB0/V4.4" }
# then recompile — a regenerated FB may need a fresh compile before download:
tia_compile { ... }
```

(`tia_device_change_version` runs `ChangeType` on the CPU item for you; the raw form, `tia_obj_invoke`
with `name:"ChangeType"` on the CPU item handle from `tia_obj_roots` / `tia_obj_items`, does the same.)

- **Rule: `project FW ≤ device FW`** — never set the project firmware **higher** than the physical
  device's (download would be rejected). Bumping the project *up to* the device FW is the safe move.
- Keep the **same MLFB**, swap only the `/V<fw>` suffix. The program (blocks/tags) survives.
- After `ChangeType` the CPU/blocks can be inconsistent; **always recompile** before any handoff.
- **⚠️ `ChangeType` RESETS GUI-gated comm settings** (runtime-validated on the 1214C): it **disabled
  the OPC UA server** (`OpcUaServer`→`false`) and **cleared the OPC UA runtime-license** selection
  (the custom server interface and PUT/GET *survived*). So **`tia_project_archive` first** on a CPU
  with hand-configured OPC UA/PUT-GET, and **re-verify after**. Recovery: `tia_obj_set_attributes
  {handle, attributes:{OpcUaServer:true}}` on the "OPC UA" device-item (it **is** writable; re-select the license in the
  GUI). `ChangeType` to the **same** version is rejected ("Cannot change the type of the device item").

## Recipe — enable a **Modbus TCP server** (`MB_SERVER`) on the S7-1200 (VERIFIED, FW V4.0)

Lets an external client (e.g. a Node backend) read/write the CPU over **Modbus TCP, port 502**
(verified 2026-06-07; full backend/app detail in `docs/COMM-SCENARIOS.md`).

1. **Non-optimized DB with an `Array of Word`** for the holding-register block (`MB_HOLD_REG`).
   Modbus needs a byte-addressable (non-optimized) DB — optimized access won't map.
2. **On FW V4.0 use `MB_SERVER` V1.x**, which takes **`CONNECT_ID` + `IP_PORT`** parameters
   (**not** `CONNECT`/`TCON`, which the newer instruction versions use). Pin the instruction
   version when generating the FB.
3. Instantiate `MB_SERVER` as a **multi-instance inside an FB** (its instance lives in the FB's
   instance DB), call it cyclically.
4. **Map a holding register → a command tag** (e.g. `MB_HOLD_REG[0]` → `LedCmd`), so writing the
   register drives the output.

> **Instance-DB gotcha (the big one):** when you regenerate the FB via `tia_source_put`, the
> existing **instance DB** can go inconsistent (its interface no longer matches the FB).
> **Recompile first** — a software-scope `tia_compile` regenerates the instance DB in most cases.
> Only if it still reports inconsistent after a compile (typical when the interface was edited via
> source), delete + recreate it, then recompile:
>
> ```
> tia_compile            { ... }                            # try first
> tia_block_delete       { ... the stale instance DB ... }   # only if still inconsistent
> tia_instancedb_create  { ... fresh instance DB for the FB ... }
> tia_compile            { ... }
> ```
>
> (Matches the §Pipeline note: recompile first, delete+recreate only as the fallback.)

## Recipe — enable **S7 / PUT-GET** on the S7-1200 (port 102)

Lets an external S7 client (e.g. `nodes7`) read/write the CPU over **S7comm, port 102**.

1. **GATE (human, GUI only):** enable PUT/GET — *Properties → Protection & Security →
   Connection mechanisms → "Permit access with PUT/GET communication"*. **Not exposed by
   Openness** on this CPU/FW (we tried `PlcAccessLevelProvider` — no toggle). Mark it as a
   **human gate** and surface it in `tia-handoff`; do **not** attempt to script it.
2. **Non-optimized DB** for the data the client touches (PUT/GET addresses absolute offsets, so
   the DB must be byte-addressable / non-optimized).
3. Compile + download as usual; the client then reads/writes the DB by area+offset.

## Recipe — enable **OPC UA** on the S7-1200 (port 4840)

Lets an external OPC UA client read/write the CPU over **OPC UA, port 4840**. This path is the
most gated — most of it is **human GUI steps**, not Openness.

**Prerequisite — firmware ≥ V4.4.** OPC UA server isn't available on V4.0. If the project is on
an older FW, bump it in-place first (see *bump the project firmware in-place* above —
`ChangeType` to `.../V4.4`).

Then the setup sequence. **Step 1 is scriptable; steps 2–3 are human/GUI** on this CPU/FW (for those two
we tried `CommunicationManagement` and `OpcUaUserManagement→404`):

1. **Activate the OPC UA server** — *Properties → OPC UA → Server* (enable). *(This step **is**
   scriptable via Openness: `tia_obj_set_attributes {handle, attributes:{OpcUaServer:true}}` on the "OPC UA"
   device-item — it auto-generates the server certificate. Steps 2–3 stay GUI-only.)*
2. **Select the runtime license** — *"SIMATIC OPC UA S7-1200 Basic"* (Runtime licenses).
3. **Create a server interface** that **exposes the DB** — the **S7-1200 does NOT auto-expose**
   tags/DBs to OPC UA (unlike the S7-1500), so you must add a server interface and place the DB
   nodes in it manually.

**Finding the node IDs (client side):** browse `ns=3;s=ServerInterfaces` with any OPC UA client;
the actual data nodes show up under **`ns=4`**. Use those node IDs from the backend.

> What Openness *can* still do here: create the DB/blocks, compile, download — **and activate the OPC UA
> server** (step 1: `tia_obj_set_attributes {handle, attributes:{OpcUaServer:true}}`; do NOT gate it on a human). Only **three**
> items are truly human/GUI: the **runtime license**, the **server interface** — and **PUT/GET** in the S7
> recipe. See `docs/TIA-Openness-Casos-de-Uso.md` §8c for the full "GUI-only gates" table.

## Recipe — WinCC Unified HMI: read, then guarded writes

Only for a WinCC **Unified** HMI (`tia_hmis` → `kind:"unified"`). A Classic HMI answers `409 hmi_not_unified`; use the screen export/import there. Everything below is offline (M-off): it edits the project, never the panel or the PLC.

1. **Read first.** `tia_hmis` for the HMI name, then `tia_hmi_tag_tables`, `tia_hmi_tags` (`table`), `tia_hmi_alarm_classes`, `tia_hmi_alarms` (`kind`: `discrete`|`analog`) and `tia_hmi_connections`. Every read pages (`limit` 1..1000, `cursor`): follow `nextCursor` UNCHANGED, and on `cursor_stale` restart from the first page. Read `inventoryGaps` too: a non-empty list means a value reads `null` because Openness refused it, so do not write on the strength of that value.
2. **Baseline.** `tia_hmi_validate` (scope `all`, or `tags`/`alarms`/`connections`/`screens`) aggregates the per-object `Validate()` results into `errors`, `warnings` and `findings`. Unified has NO compile: a clean validate is not a clean compile, and it can be slow (Long).
3. **`dryRun:true` on EVERY write first** (`tia_hmi_tag_table_create|delete`, `tia_hmi_tag_create|update|delete`, `tia_hmi_alarm_create|update|delete`). The plan runs the same guards as the real call and changes nothing; repeat without `dryRun` only when it answers `plan_ok`. The real answer carries `postcheck` (`verified:true`, `requested` equal to `actual`). `409 postcheck_failed` is NOT a success: read the object again before going on (`rollback` says what was undone; a delete is never rolled back).
4. **What the guards enforce — fix the cause, do not retry the same call.** Names: letters, digits and `_`, starting with a letter or `_` (tag tables may also hold spaces and `-` inside), at most 128 characters (`invalid_name`), unique ignoring case (`name_collision`). `dataType` is an allow-list: Bool, Byte, Char, DInt, DWord, Int, LInt, LReal, LWord, Real, SInt, String, UDInt, UInt, ULInt, USInt, Word, WChar, WString, DateTime, Time (`invalid_data_type`). A tag without `connection` is internal and needs `dataType`; with `connection` it is external and takes exactly one of `plcTag` or `address`. A PLC-bound tag needs a `plcTag` that EXISTS in the connected PLC (`plcName` when the connection's partner does not resolve to one PLC): `plc_unresolved` / `reference_not_found` mean fix the link, never invent a tag. A PLC tag whose own name contains a dot or a bracket is sent as ONE quoted token (`"A.B"`, `"Valve[1]"`): unquoted, `A.B` is member `B` of data block `A` and `Valve[1]` is an indexed name, so the call is refused. A discrete alarm needs an existing `alarmClass` and `triggerTag` and a `triggerBit` inside the width of the tag's type (Bool: 0, Word: 0..15; `trigger_bit_out_of_range`); an analog alarm has ONE `condition` and ONE `conditionValue` on a numeric tag (no limit ordering exists), and the value must fit the type (`condition_value_out_of_range`).
5. **Alarm values, event text and what a read shows.** TIA stores the condition value of an alarm as a double: on an `LInt`, `ULInt` or `LWord` trigger tag a whole `conditionValue` above 2^53 in absolute value is refused `409 condition_value_out_of_range` (a `dryRun` too, nothing written); 2^53 itself is accepted, sent as a string, and `Real` and `LReal` values are always JSON numbers. `eventText` is PLAIN single-paragraph text per active project language: the serve wraps it as the rich text TIA stores (`<body><p>…</p></body>`) and escapes `&`, `<` and `>`, so send no markup; a line break, an XML-invalid character (a tab is allowed), an unpaired surrogate, a blank text or more than 1024 characters is `400 bad_request`, and a text cannot be cleared by a write. A read answers the plain text (an event-text item without text is `""`, a language without an item `null`; any other markup comes back as raw rich text, which cannot be written back). TIA's placeholders read as `null`: an internal tag has `connection`, `plcName`, `plcTag`, `address`, `accessMode`, `acquisitionMode` and `acquisitionCycle` all `null` (TIA reads its connection back as a placeholder such as `<Internal tag>`), and an alarm class without a common class has `commonAlarmClass` `null` (`<No alarm class>`). The attribute list of an alarm itself is never read: `hmi_attribute_list_unavailable` and `hmi_attribute_not_writable` apply to tags and to the event text item of each culture (its list unreadable, `Text` not writable, or no item for that language), never to another alarm attribute.
6. **Deleting.** A tag, or a tag table that holds one, is refused with `tag_in_use` while an alarm references it; a non-empty table needs `recursive:true` (`tag_table_not_empty`); the default table is refused. References from screens, scripts and logging are NOT scanned, so run `tia_hmi_validate` again after a delete.
7. **Finish** with `tia_hmi_validate` and compare `errors` and `findings` with the baseline.

Limits to remember: a **create's `dryRun` cannot check writability** (a `plan_ok` can still end in `hmi_attribute_not_writable`, after which the new object is removed again); an **update checks only what it changes** (a tag change against the stored bit or value, a connection change against its link), never a reference it leaves alone, and never switches a tag between `plcTag` and `address` — `tia_hmi_validate` finds a dangling carried reference; send a whole `conditionValue` as a **JSON integer or a string** (`5.0` and `1e3` are refused, and so is a whole value above 2^53 on an `LInt`, `ULInt` or `LWord` tag: step 5); a system tag may be an alarm trigger tag; `tia_hmi_validate` is Long, so it may answer `status:"running"` with a `jobId`: follow `tia_job_status` and never repeat the call.

No tool creates an HMI connection: when `tia_hmi_connections` is empty, PLC-bound tags cannot be created — ask the human to create the connection in TIA Portal.

## Recipe — diff a project against a VCI workspace, or round-trip a block through a new one

A VCI workspace is a folder on the serve host that mirrors project objects as files, so a diff tool or git can version
them. VCI takes **leaf objects only** (PLC blocks, PLC data types, tag tables): a device, a PLC, a group or the library is
refused with `409 vci_not_leaf` before VCI is called. Every write takes `dryRun:true` first (Gd11), a call holds at most 50
objects, and a batch is NOT a transaction: it stops at the first failure.

**(1) A workspace that already has mapped objects is a baseline: its diff is READ-ONLY.**

```
tia_vci_workspaces                                   -> `mappedObjects` above 0: a baseline exists
tia_vci_status { workspace:"WS_1", limit:100 }       -> follow nextCursor until it is null
```

Classify every row. `equal` is the only verified match. `projectChanged` (the project object changed), `workspaceChanged`
(the file changed), `conflict` (both), `workspaceFileMissing` (the file is gone) and `unequal` (a difference of unknown
side) are differences: report each by name, they are the result, not something to repair. `unknown`, `unsupported` and
`statusFailed` prove nothing, neither equality nor a diff: report them by name, and the diff is NOT complete. **Never
export or import just to make a comparison equal.** `tia_vci_export` over a mapped object REPLACES its workspace file
with the project content (the plan says `action:"synchronize"`) and `tia_vci_import` replaces the project object with
the file, so either one destroys the difference you were asked to see. Refreshing the baseline is an explicit decision
of the human: name the objects, ask, and only then export with `dryRun:true` first and read which files the plan
replaces.

**(2) A NEW workspace, or new objects: export, then prove it.**

```
(a) tia_vci_workspaces                     -> reuse a workspace that is listed
    # none yet: ask the HUMAN for the root folder on the serve host. Never choose or invent a rootPath.
    tia_vci_workspace_create { name:"WS_1", rootPath:"<the folder the human gave>", dryRun:true }
    tia_vci_workspace_create { name:"WS_1", rootPath:"<the same folder>" }           -> created | reused
(b) tia_vci_export { workspace:"WS_1", objects:[{ kind:"block", name:"FB_Motor" }], dryRun:true }
    tia_vci_export { workspace:"WS_1", objects:[{ kind:"block", name:"FB_Motor" }] } -> the file(s) written
(c) tia_vci_status { workspace:"WS_1", limit:100 }   -> follow nextCursor until it is null
(d) tia_export_block { plc:"PLC_1", block:"FB_Motor" }                               -> contentHash
    tia_block_set_attribute { plc:"PLC_1", block:"FB_Motor", name:"HeaderAuthor", value:"<a new text>" }   -> an edit IN PLACE: the mapping survives
    tia_block_compile { plc:"PLC_1", block:"FB_Motor" }
    tia_export_block { plc:"PLC_1", block:"FB_Motor" }                               -> a DIFFERENT contentHash
    tia_vci_status { workspace:"WS_1", limit:100 }   -> that row is now projectChanged
(e) tia_vci_import { workspace:"WS_1", objects:[{ kind:"block", name:"FB_Motor" }], dryRun:true }
    tia_export_block { plc:"PLC_1", block:"FB_Motor" }                               -> a fresh contentHash
    tia_vci_import { workspace:"WS_1", objects:[{ kind:"block", name:"FB_Motor", expectedContentHash:"<fresh>" }] }
    tia_export_block { plc:"PLC_1", block:"FB_Motor" }                               -> the import REPLACED the project object: read it again by name
    tia_vci_status { workspace:"WS_1", limit:100 }   -> that row is equal again
```

- **(b) Read the plan.** `action:"export"` creates a new file; `willCreateDirectory:true` on an object means the serve will
  create its target folder (the first export into a fresh workspace has none yet), and the dry run creates nothing. An
  object the plan lists as `synchronize` is already
  mapped and its file would be REPLACED: stop and go back to (1). `format` chooses the file format of an UNMAPPED object
  only (leave it out unless the serve answers `400 bad_request` with `details.supportedFormats`); a mapped object keeps its
  mapping's format and the selector is neither applied nor validated for it.
- **(c) Verify an export.** Every row of every page must be `equal`. Read `coverage` on EVERY page: `summary` and
  `coverage` describe only the rows of that response (the serve compares only the rows of the page), so fold them over all
  pages before saying the workspace is in sync. `409 cursor_stale` (a mapping appeared or went) restarts the walk once.
- **(d) Edit the project IN PLACE, never by regenerating.** A block attribute (`tia_block_set_attribute`, a header attribute such as `HeaderAuthor`) keeps the project object, so its mapping stays and the row becomes `projectChanged` (measured on V21). If `tia_export_block` shows the same `contentHash` afterwards, that attribute is not part of the exported XML: try another header attribute (`HeaderFamily`, `HeaderName`). `tia_source_put` (regenerating the block from SCL) REPLACES the project object, and V21 DROPS its VCI mapping (measured): the row vanishes from `tia_vci_status` and `tia_vci_import` answers `409 not_mapped`, which is the correct answer, not a fault; `tia_import_xml` over an existing block replaces it the same way (not measured separately). Export the new object again to map it: `tia_vci_export` is refused `409 vci_path_collision` (`reason:"file_exists"`) while the old workspace file is still in the folder, so ask the human to remove or move that file first; on a baseline you were asked to diff, report the dropped mapping instead of exporting over it.
- **(d) What a row says.** Only `equal` is a match. After a human edits a workspace file its row should show
  `workspaceChanged`; a row that still says `equal` after a known edit means the status is not live (V21 has no refresh
  call): say so and treat the check as NOT verified.
- **(e) Read the plan before importing, and read the hash per kind.** The dry run shows per object `statusBefore` and
  `overwritesProjectChanges` (`true` for `projectChanged` and `conflict`: the import discards an edit that exists only in
  the project, there is no undo, so ask the human). An object that is already `equal` is skipped. The hash reader depends
  on the kind: a block uses `tia_export_block`, a type uses `tia_export_type { plc:"PLC_1", type:"UDT_Motor" }`, and a tag
  table has NO hash (the serve and the MCP refuse `expectedContentHash` for it), so rely on the dry run and the postcheck.
  A wrong `expectedContentHash` is `409 state_changed` and nothing was written.
- **An import REPLACES the project object.** After a real import the old object is disposed: a handle of it (`tia_obj_*`) and every value read before are stale, so re-read the block by name (`tia_export_block`, `tia_plc_blocks`) and then `tia_vci_status`. The serve does the same for its postcheck: an object it cannot find again by name, or whose mapping the replacement dropped, is `409 import_unverified` (the object WAS written). In a batch, an object that can no longer be found or mapped when its turn comes stops the batch there: `409 vci_batch_incomplete` naming it, or `409 conflict` when nothing was imported yet; nothing more is written.
- **Verified only with a postcheck.** An import is done only when every imported object has `postcheck.verified:true`. Every
  other answer means it is NOT verified: `409 import_unverified` (the object WAS written, review it with `tia_export_block`
  or `tia_export_type`), `409 vci_batch_incomplete` (the objects in `done` WERE written), a status row `unsupported`,
  `statusFailed` or `unknown`, `coverage.complete:false`, an omission marker that survives smaller `limit` retries, or a
  page walk that did not finish.
- **Unknown outcomes.** `504 worker_restarted`, a `timeout` or a lost session during an export or an import leaves the
  outcome UNKNOWN or partial: walk `tia_vci_status` and re-read the object before repeating anything.
- **Refusals before any write** (nothing changed): `vci_path_collision` (two objects, another mapping or an existing file
  share a target; `reason:"alias_unverifiable"` means the short 8.3 name of an existing file in the target folder could not
  be read, so a collision with its alias cannot be excluded), `vci_path_too_long`, `vci_mapping_outside_workspace` for an
  EXISTING mapping rejected in the plan, `not_mapped` (export it first), `workspace_file_missing`, `workspace_exists`,
  `workspace_root_in_use`, `workspace_ambiguous` (ask the human which workspace is meant) and `vci_inventory_incomplete`
  (the workspace inventory could not be read completely: report it and stop, never guess a workspace).
- **`vci_mapping_outside_workspace` has TWO outcomes.** An existing mapping rejected in the plan changed nothing. After a
  NEW export the same kind means the file WAS written outside the workspace root: read its message and `details`
  (`object`, `directory`, `root`, `done`), report it, hand the cleanup to the human and never retry blindly.

## Reference — global library and CAx error contracts (by app version)

**Project library** (`tia_block_from_mastercopy`). A device copy is refused (`409 mastercopy_not_blocks` after app 1.6.3; up to 1.6.3 a 500).

**Global libraries** (`tia_global_library_save` / `_close`). After app 1.6.3 a name that picks no single open USER library is refused, nothing saved or closed: `404 not_found` (`details.userLibraries` lists the names that work), or `409 conflict` for a read-only system/corporate library or a name several user libraries match only ignoring case; up to 1.6.3 the serve reports success even for an unknown name. A library opened read-only (`readWrite:false`) cannot be saved: `409 conflict` (`details.readOnly`) after app 1.6.3, a 500 up to 1.6.3 — close it and open it again with `readWrite:true` to change and save it.

**CAx (AutomationML)** (`tia_cax_export` / `tia_cax_import`). A failed transfer is an error (`500 cax_transfer_failed`) after app 1.6.3; up to 1.6.3 the serve returns an opaque `result` even on failure — check the devices with `tia_devices`.

## Reference — download plan fingerprint limits

**Fingerprint limits** (`tia_download`): user program blocks, UDTs and tag tables only — no hardware configuration, system block groups, S7-1500 software units or technology objects; per-object fallback to modification dates (`source:"dates"`, warned in the plan — dates can false-positive `plan_stale`).

## Recipe — generate the FAT/SAT I/O list (tia_io_map)

**Generate the FAT/SAT I/O list** (`tia-verify` step 6). `tia_io_map` (`jobId` → `tia_job_status`), one
list per PLC, `limit:100`, `cursor` = previous `nextCursor` unchanged until null. Read `coverage` on every
page; `cursor_stale` or differing coverage restarts once; omission marker: same call and cursor, half the
`limit`, max 3 times, never follow its cursor. Rows: one per tag on a `channel`, or on a `range` with
status `matched`; per unmatched `tag` entry; and (empty tag) per unmatched `channel` or channelless
`range`; none for a `range` with status `channels`; a tag spanning channels: ONE row (`table`+`name`)
listing them; statuses `matched`|`unmatched`|`conflict` only. Unresolved channels/ranges and unparsed
tags: "Could not be mapped". Print `coverage` numbers, `coverage.limits`, DERIVED addresses (spot-check in
TIA). Complete ONLY after a finished walk with no marker left on ANY page and `coverage.complete: true`,
same counts, on every page; else start "NOT complete", say why. An unmatched tag is never
"unused"/"orphan"; never invent, round or fix an address. Read-only; the human signs.

Lengths: a `range`'s `start` is a byte number and its `length` is in BYTES (Openness reports an address length in bits and the map converts it, rounding up to whole bytes); `from` and `to` are its first and last bit (2 bytes from `%I0.0` end at `%I1.7`). `tia_device_tree` shows the raw Openness value, in BITS: convert before comparing the two.

## Recipe — prove the project matches the versioned XML (tia_block_compare)

**The project matches what's versioned — prove it, don't assume it.** A raw hash of an
export is NOT proof (two exports of the same block differ in `<Created>`/UIds). Use
`tia_export_block` to pull a block inline and `tia_block_compare` to diff it against the
committed XML (normalized — ignores formatting/BOM/`<Created>`/UIds); `verdict:"equal"` is
the actual round-trip proof. After `tia_compile`/`tia_source_put`, read `blockChanges` and
export/commit any regenerated instance DBs before calling the project verified.

## Reference — network, audit and CAx how-to

**Network lifecycle.** `tia_subnet_delete` on a non-empty subnet is refused (`409 subnet_not_empty`); `disconnectNodes:true` disconnects its nodes and removes its IO systems. A subnet rename (`tia_subnet_update` `name`) takes at most 24 characters: a longer name is `400 invalid_subnet_name` (a `dryRun` too, nothing changed) although `tia_subnet_create` accepts longer names; a name equal to the current one is not a rename, and the serve counts UTF-16 code units, spaces included. PROFINET name (`tia_pn_name_set`): lower-case DNS labels (`a-z0-9-`) split by `.`, not an IP look-alike. A node in its default state (automatic name generation on, `PnDeviceName` read-only) takes a `name`: the serve switches auto-generation off first and writes the name second, and its `dryRun` cannot prove that the name becomes writable, so a `plan_ok` can still be followed by `409 pn_name_unsupported` from the real call; the serve then writes the previous auto-generation back and verifies it, the error ends with "Nothing was changed." only when that read-back confirmed it, and otherwise `409 conflict` names `autoGeneration` as NOT restored: re-read with `tia_device_network`. IO system first: `tia_io_system_create` on the controller, then `tia_io_system_connect` per device; `409 cross_subnet_assignment`: connect the device to that subnet (`tia_network_connect`) first.

**Audit** (class R). Read blocks/types/tags via `tia_plc_*` and check the engineering baseline: optimized access, 100% symbolic, UDT-typed interfaces, FB + instance-DB, uniform naming. Scope `tia_crossrefs` with `target`/`kind` on a big project: a whole-PLC read can take minutes.

**CAx (AutomationML).** `tia_cax_export` exports one device or the whole project; `tia_cax_import` takes `option`: `RetainTiaDevice` (default) / `OverwriteTiaDevice` / `MoveToParkingLot`.

## Where to stop

Everything above is **offline (M-off)**. `tia_download` / `tia_online` (G3/G4) are **not**
part of scaffold — they belong to `tia-handoff` and require explicit human approval.

---

# The project-spec (input model)

A project-spec is ONE JSON document describing the whole project. Always run it
through the pipeline front door: `tia_spec_validate` (rung 0, pure) → `tia_spec_plan`
(dry) → `tia_spec_apply` (M-off, stops at gates).

`tia_spec_validate` checks the shape only in part (it does not run the JSON Schema; the `spec-validate`
skill adds it) and enforces: unique device/subnet/UDT/block/per-table tag names; every network node IP
inside the subnet CIDR; `OrderNumber:<MLFB>/V<fw>` with `/V` — never `:V` (Gd5); no STL/GRAPH on an
S7-1200; at most 8 SMs on an S7-1200 (its only module limit); and G5 — a spec with safety content
marked autonomous is REJECTED (F-logic is never autonomous).

Minimal example:

```json
{
  "project": { "name": "Line2", "directory": "C:\\TIA\\Line2" },
  "conventions": {
    "namingScheme": "plcopen",
    "optimizedAccess": true,
    "symbolicOnly": true,
    "defaultLanguages": { "interlocks": "LAD", "algorithms": "SCL", "sequencers": "GRAPH" }
  },
  "devices": [
    {
      "name": "Line2_CPU",
      "typeIdentifier": "OrderNumber:6ES7 511-1AK02-0AB0/V2.9",
      "role": "cpu",
      "family": "S7-1500"
    }
  ],
  "network": {
    "subnet": { "type": "System:Subnet.Ethernet", "name": "PN_Line2", "cidr": "192.168.0.0/24" },
    "nodes": [{ "device": "Line2_CPU", "ip": "192.168.0.1", "createIoSystem": true }]
  },
  "dataTypes": [
    {
      "name": "UDT_Motor",
      "members": [
        { "name": "xStart", "dataType": "Bool", "comment": "Start command" },
        { "name": "rSpeed", "dataType": "Real", "comment": "Speed [%]" }
      ]
    }
  ],
  "tagTables": [{ "name": "IO", "purpose": "IO" }],
  "tags": [{ "table": "IO", "name": "Conv01_Run", "dataType": "Bool", "address": "%Q0.0" }]
}
```

The plan and `tia_spec_apply` neither import `dataTypes` nor author block logic: UDTs go in with
`tia_types_import`, logic with `tia_source_put` / `tia_import_xml`.

Resolve every concrete MLFB + firmware via `tia_catalog` before building — never guess
an order number. Project firmware must be ≤ the physical device's firmware.
