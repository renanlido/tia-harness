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
3. **Long operations are jobs.** Long tools (connect, compile, download, upload,
   project create/save/archive, exports, CAx…) may answer `status:"running"` with a
   `jobId` — the operation is STILL running on serve. Call `tia_job_status {jobId}`
   until it returns the final result; never repeat the original call. On `kind:"busy"`, poll
   `tia_job_status` only for a running job whose `jobId` is known (e.g. `details.jobId`).
   `tia_ping` probes `/health`: never busy, no job ID — use it for reachability only.
   Without a known running job ID, wait/recheck with `tia_status`; for `connect_incomplete`,
   follow the host-inspection handoff (`tia_guide {"topic":"gui-gates"}`), never retry connect.
   Offline tools (`tia_guide`, `tia_spec_validate`, `tia_spec_plan`, `tia_job_status`) never answer busy.
4. **Compile before deploy.** `tia_compile` aggregates hardware + software and is the
   offline verifier: `errors:0` is the Gd9 precondition for download (G3) and for S7
   connections.
5. **Follow the build pipeline order** (details: `tia_guide {"topic":"pipeline"}`):
   validate the spec (`tia_spec_validate`) → plan (`tia_spec_plan`) → scaffold
   (`tia_spec_apply` or the M-off tools) → verify (`tia_compile`) → human-gated deploy
   (`tia_download` with dryRun → human approval → `approved:true` + the same `planHash`).
6. **Fresh CPUs may need GUI setup** (PUT/GET, OPC UA license/interface); a prepared station can
   inherit these via `tia_device_from_mastercopy`. Read `tia_guide {"topic":"gui-gates"}`.
   Missing settings are human handoffs, not retryable failures.
7. **Prerequisites:** run the serve (`http://localhost:5000`; `tia_ping`). First
   connect per process may need G1; running/timeout alone are not G1 evidence.
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
- **Fresh 1214C communication settings:** PUT/GET, OPC UA license and HR interface need a
  human source configuration; `tia_device_from_mastercopy` can inherit it into a new station.
  Server activation is scriptable: `tia_obj_set_attributes {handle, attributes:{OpcUaServer:true}}`.
  Details and certificate recovery: `tia_guide {"topic":"gui-gates"}`. Never script the GUI.

**Deploy-time approval gates** (download / online / network-scan / secret / safety = **G3/G4/G7/G6/G5**)
are a *different* class — see the **`tia-handoff`** skill. Those are "a human **approves an action**",
not "a human **clicks a GUI setting**". Both are human interaction points; surface them as
`requires_human_action` with concrete guidance, never as a tool failure.

---

# GUI gates — expected human interaction points

## Human interaction points (GUI gates) — EXPECTED, not an error

Expected handoffs include trust, fresh-CPU setup and firmware-change recovery.
On the validated 1214C V4.4, no direct setter for PUT/GET, license selection or HR mapping was verified;
a **prepared station master copy inherits all three**. Do not blindly retry a missing setting: give the human the exact steps.

| # | Signal you'll see | Why it's expected | Tell the human (exact GUI steps) |
|---|---|---|---|
| **G1 trust** | `EngineeringSecurityException` or a failed start with `details.cause:"trust"` → `requires_human_action` / `trust_dialog`. Neither `running` nor the 20-minute client timeout (`STARTING_UNCONFIRMED`) proves G1 or success. | First attach may prompt **per serve process**. | Human on the **serve host**: click **"Yes to all"** only on a visible trust dialog. While a job runs, poll `tia_job_status`; do not queue calls. A timeout does not cancel it: inspect the host, wait for completion before status/retry. After explicit G1 handoff, retry with `resumeToken`. For `TRUST_DIALOG_DENIED_OR_EXPIRED`, inspect `closedPids`/`stillRunningPids`/`unknownPids`: close only verified remaining TIA started by serve **with no open project**, then retry with a human ready. |
| **OPC UA license** | `tia_compile` **ERROR**: *"The selected OPC UA license is not sufficient…"* | No verified direct setter on this 1214C; a fresh project or firmware change can leave it unset | CPU → **Properties → General → Runtime licenses → OPC UA** → required **"SIMATIC OPC UA S7-1200 Basic"**; purchased → the license the owner declares for this CPU. Recompile. |
| **OPC UA interface** | OPC UA client connects but the DB nodes aren't there (`ns=4` empty / no `ServerInterfaces`) | The validated **S7-1200** requires a configured server interface to expose DBs | CPU → **OPC UA communication → Server interfaces → Add new server interface** → type **Interface** → drop the **`HR` array** (`ModbusData.HR`), not the DB or individual elements. Recompile. |
| **PUT/GET** | S7 client connects on port 102 but reads return access-denied | No verified direct setter on this 1214C | CPU → **Properties → Protection & Security → Connection mechanisms** → check **"Permit access with PUT/GET communication from remote partner"**. Compile + human-gated download (`hardware:true`). |
| **FW-change reset** | After `tia_device_change_version`: OPC UA server off, the license error on compile, blocks `isConsistent:false` | `DeviceItem.ChangeType` **resets GUI-gated comm settings** (server activation + license); the interface & PUT/GET survive | `tia_project_archive` **before** the FW change. After: re-set `OpcUaServer:true` via `tia_obj_set_attributes` (scriptable), re-select the license (row above), recompile. |

**Bounded connect:** `connect_incomplete` / `CONNECT_UNCONFIRMED` (`serve_host_inspection`)
names the last phase, not G1 or success. No cancellation or TIA kill: don't repeat or queue work.
Human: inspect the host and answer pending Siemens dialogs. If none is pending and unresponsive,
save stdout (CLI) or `%APPDATA%\TIAOpenness\startup.log` (tray, overwritten on launch),
then restart the **process** (tray: Exit/relaunch, not API Stop/Start).
TIA may remain running: inspect it and verify project state before reconnecting.
A finished MCP job carrying this handoff isn't connection proof.

**Prepared station:** `tia_library_mastercopy_create {device}`, then `tia_device_from_mastercopy {masterCopy}`
clones all three settings and HR mappings. Not an existing-CPU setter or license grant.
Certificates are not copied: on the NEW "OPC UA" item, `OpcUaServer:false` then `true` regenerated one; compile afterwards.
GUI type **Interface** maps to `SimaticInterface` (Export, no Import).
The separate `ServerInterface.Import` did not reproduce its HR mappings.

**1214C/V21 bench, 2026-10-26:** `HR[0..2]` IDs in `ns=4`: HR array → `13,14,15`;
individual elements → `12,23,34`; whole DB → `14,15,16`.
Selection/order affects IDs; probe after construction/import.

---

# Hard-won gotchas (runtime-validated)

## Hard-won gotchas

1. **Always compile before deploy.** `tia_compile` aggregates **hardware + software**; a
   **clean** compile (`errors:0`) is the precondition for download and for S7 connections.
   `tia_download` compiles too and leaves the project modified (`projectModified` in plan/result):
   save (`tia_project_save`) before switching projects; Openness does not say what changed.
   First download over another project's or TIA version's program: plan
   `allowUpgradeTargetDevice:true`, or a refusal may leave the CPU stopped (the plan cannot predict it).
2. **One serial worker:** never concurrent `tia_*` calls; a hung operation may need a serve restart.
3. **FB edits:** software-scope `tia_compile`; export regenerated DBs (`blockChanges`).
   Still inconsistent: `tia_block_delete` + `tia_instancedb_create`, recompile.
   **Global DB source put** re-creates it: `IsOnlyStoredInLoadMemory` resets
   (no source support; pragma ignored); nested starts need `BEGIN`.
   UDT put/`tia_types_import` did not reset DB values. Save XML/text/flags.
   Inspect `changeImpact.dbAttributeChanges`/`readGaps` (unknown; `trackChanges:false` opts out).
   Restore flag=true: `tia_block_set_attribute`, compile; starts: saved XML/text, not attributes.
   **N warnings then 0:** hardware compile produced OPC UA guest/unsecured + missing
   protection-level warnings; next skipped hardware. Check `messages[]` "Hardware configuration".
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
   dedicated EMPTY project.** Bench (S7-1200 1214C, 2026-09-26): 0 → 1 device in ~75 s, twice,
   with the CPU in RUN throughout. Protect the working project FIRST: `tia_project_create` closes
   it and is refused (`409 unsaved_changes`) while it has unsaved changes, so `tia_project_save` +
   `tia_project_archive` first (never `discardUnsavedChanges` to get past the refusal), with the
   archive `name` WITH the `.zap21` extension (absent or extension-less fails).
   **A V17 program does not upload into V21 (2026-10-31):** use the TIA version the program was
   made with. `upload_incompatible_version` is definite: check versions and `stationAdded` in
   `details`; a partial station is not a backup. Approval stays single-use.
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
- A first connection per serve process may show a trust dialog; a human confirms it on the serve host. A slow start or timeout alone is not G1 evidence.

---

# The build pipeline (spec → verified project)

TIA version preflight: `tia_guide {"topic":"recipes"}`, 'TIA version evidence and SimaticML', before authoring.

| # | Stage | Tool(s) | Class | What it does |
|---|---|---|---|---|
| 0 | Validate the spec | `tia_spec_validate` | R (pure) | Partial shape checks + the cross-field rules the tool implements: unique names, IP inside the subnet CIDR, Gd5 order-number format, no STL/GRAPH on S7-1200, the G5 safety rule, at most 8 SMs on an S7-1200. It does NOT run the JSON Schema or per-model module limits; the `spec-validate` skill covers both. Needs no serve. |
| 1 | Plan | `tia_spec_plan` | R (pure) | Turns a VALID spec into the ordered list of M-off operations. Nothing mutates. |
| 2 | Scaffold | `tia_spec_apply` (or the M-off tools manually) | M-off | Creates part of the project content in dependency order (scope below). Stops at every gate. |
| 3 | Verify | `tia_compile` | M-off | THE offline verifier: aggregates hardware + software. Gd8: only ERRORs block. `errors:0` is the Gd9 precondition for any deploy. |
| 4 | Handoff / deploy | `tia_download` | GATE G3 | `dryRun:true` verifies compile, connection and software fingerprint → `planHash` → HUMAN approval → `approved:true` + SAME single-use `planHash`. Serve re-checks software (`plan_stale` if changed). Approval binds connection/options and covered software, NOT hardware: humans must confirm hardware has not changed since that dryRun; changed hardware needs a NEW plan and approval, never the old token. Fingerprint covers user blocks, UDTs and tag tables only; exclusions and `source:"dates"` fallback: `tia_guide {"topic":"recipes"}`, 'Reference — download plan fingerprint limits'. Never self-approve; resolve connection via `tia_pg_interfaces` (no scan). |

For the first download over another project's or another TIA version's program, plan with
`allowUpgradeTargetDevice:true`; without it, a refusal may leave the CPU stopped.
The offline plan cannot predict whether TIA will request that confirmation.

For the first download over another project's or another TIA version's program, plan with
`allowUpgradeTargetDevice:true`; without it, a refusal may leave the CPU stopped.
The offline plan cannot predict whether TIA will request that confirmation.

Scaffold order (UDTs BEFORE the blocks that use them): by hand, `tia_guide {"topic":"recipes"}`, 'Pipeline order'. `tia_spec_apply` automates only subnets, devices, modules, network, tag tables, tags, FB shells, control-module instance DBs and the compile; protection, constants, UDTs and all logic stay manual. The FB shells it creates are empty: add their logic with `tia_source_put` (SCL) or `tia_import_xml` (LAD/FBD).

Use the PlcSoftware name from `tia_plcs`, not the device name.

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
- `tia_crossrefs` (R, Long; poll `tia_job_status` for `jobId`): `UnusedObjects` returns
  CANDIDATES, not proof (OBs, external-only uses and library TYPEs can look unused).
  Before edits, use `target`, `kind`, `filter:"ObjectsWithReferences"`; the human interprets
  TIA's `referenceType` (`Uses`/`UsedBy`) and `access`. Page containers/whole PLCs with
  `limit` + unchanged `nextCursor` until null. App 1.8+ caches whole-PLC walks until mutation/close/cursor expiry;
  older serves re-read pages. Read coverage on every page, not only the first:
  a later page can report less than an earlier one. On `cursor_stale`, restart from the first
  page; differing counts restart the walk once from the first page. On omission retry the same request with smaller `limit`,
  never its cursor. Claim complete/no uses ONLY after a finished walk with identical counts,
  no omissions and `coverage.complete:true` on EVERY page; else NOT complete
  (inspect `coverage.unavailableOwners`).
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
  `tia_device_from_mastercopy` inherits PUT/GET, OPC UA license selection and HR mappings into a NEW station; regenerate its certificate;
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

<!-- tia-harness:end -->
