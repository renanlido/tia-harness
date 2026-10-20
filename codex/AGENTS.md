> **Note:** The block between the `tia-harness` markers below is GENERATED from `mcp/content/`
> (run `cd mcp && npm run sync`) — do not hand-edit its body. This header (outside the
> markers) is specific to the Codex port and is edited normally.

# Working with the TIA Portal Automation Harness (Codex)

The harness pieces arrive through the `tia-harness` Codex plugin and one copy step:

- **Skills** come with the plugin, listed as `tia-harness:<name>` (each with its YAML frontmatter +
  auxiliary files like `RULES.md`/`RECIPES.md`/`CPU-TABLE.md`/`BASELINE.md`).
- **Subagents** are copied to `<codex home>/agents/<name>.toml` (tia-engineer, hardware-architect,
  verifier, safety-reviewer).
- **The `tia` MCP** is registered by the plugin. See [../docs/INSTALL.md](../docs/INSTALL.md) for the
  exact install/uninstall steps and the remote-`serve` override.
- The guided setup `@renanlido/plcware-setup` (not published yet) is the other route: it adds the MCP, the skills and
  the subagents without the plugin and pre-approves the read-only tools. Use one route per agent.

<!-- tia-harness:start -->

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
| **OPC UA license** | `tia_compile` **ERROR**: *"The selected OPC UA license is not sufficient…"* | License selection is GUI-only (no Openness service); a fresh project **or a firmware change** leaves it unset | CPU → **Properties → General → Runtime licenses → OPC UA** → *Type of required license* → select **"SIMATIC OPC UA S7-1200 Basic"** (the 1214C option). Recompile. |
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
| 0 | Validate the spec | `tia_spec_validate` | R (pure) | JSON-Schema + cross-field engineering rules (unique names, same-subnet IPs, Gd5 order-number format, per-CPU module limits, language-by-family, the G5 safety rule). Needs no serve. |
| 1 | Plan | `tia_spec_plan` | R (pure) | Turns a VALID spec into the ordered list of M-off operations. Nothing mutates. |
| 2 | Scaffold | `tia_spec_apply` (or the M-off tools manually) | M-off | Creates the project content in dependency order (see below). Stops at every gate. |
| 3 | Verify | `tia_compile` | M-off | THE offline verifier: aggregates hardware + software. Gd8: only ERRORs block. `errors:0` is the Gd9 precondition for any deploy. |
| 4 | Handoff / deploy | `tia_download` | GATE G3 | `dryRun:true` asks serve for a VERIFIED plan (clean compile, resolved connection, software fingerprint) → plan + `planHash` → a HUMAN approves → re-call with `approved:true` + the SAME `planHash` (serve re-checks the fingerprint and refuses `plan_stale` if the software changed). The approval covers the connection/options and the covered software content — NOT the hardware configuration (a hardware change after approval passes the token check). Re-plan (new dryRun) + fresh human approval only when the hardware configuration changed AFTER the dryRun that produced the token — the fingerprint cannot detect that change, so the human must confirm nothing hardware-side moved; never reuse the old token for changed hardware. The fingerprint covers only user program blocks, UDTs and tag tables (what it leaves out, the `source:"dates"` fallback: `tia_guide {"topic":"recipes"}`, 'Reference — download plan fingerprint limits'). Never self-approve. Pick the connection with `tia_pg_interfaces` (no scan). |

Scaffold order (UDTs BEFORE the blocks that use them): `tia_spec_apply` follows it; by hand, `tia_guide {"topic":"recipes"}`, 'Pipeline order'.

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

# Recipes (runtime-verified)

Not copied here: Codex reads at most 32 KiB of AGENTS.md and cuts the rest without a word. Call
`tia_guide {"topic":"recipes"}` for the verified recipes (unlocking a freshly-created CPU, the in-place firmware
bump, Modbus TCP, S7 PUT/GET and OPC UA on the S7-1200, the scaffold order) before you need one.

---

# The project-spec (input model)

A project-spec is ONE JSON document describing the whole project. Always run it
through the pipeline front door: `tia_spec_validate` (rung 0, pure) → `tia_spec_plan`
(dry) → `tia_spec_apply` (M-off, stops at gates).

Rules the validator enforces (beyond the JSON Schema): unique device/tag/block names;
every network node IP inside the subnet CIDR (same-subnet rule); `OrderNumber:<MLFB>/V<fw>`
format with `/V` — never `:V` (Gd5); per-CPU module limits; language by family (e.g.
S7-1200 has no GRAPH); and the G5 rule — a spec with safety content marked autonomous
is REJECTED (F-logic is never autonomous).

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

Resolve every concrete MLFB + firmware via `tia_catalog` before building — never guess
an order number. Project firmware must be ≤ the physical device's firmware.

<!-- tia-harness:end -->
