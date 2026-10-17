> **Note:** The block between the `tia-harness` markers below is GENERATED from `mcp/content/`
> (run `cd mcp && npm run sync`) — do not hand-edit its body. This header (outside the
> markers) is specific to the Codex port and is edited normally.

# Working with the TIA Portal Automation Harness (Codex)

The harness pieces live in standard Codex locations:

- **Skills** in `~/.agents/skills/<name>/SKILL.md` (each with its YAML frontmatter + auxiliary
  files like `RULES.md`/`RECIPES.md`/`CPU-TABLE.md`/`BASELINE.md`).
- **Subagents** in `~/.codex/agents/<name>.toml` (tia-engineer, hardware-architect, verifier,
  safety-reviewer).
- **The `tia` MCP** wired via `~/.codex/config.toml`. See [../docs/INSTALL.md](../docs/INSTALL.md)
  for the exact install/config steps.

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
3. **Compile before deploy.** `tia_compile` aggregates hardware + software and is the
   offline verifier: `errors:0` is the Gd9 precondition for download (G3) and for S7
   connections.
4. **Follow the build pipeline order** (details: `tia_guide {"topic":"pipeline"}`):
   validate the spec (`tia_spec_validate`) → plan (`tia_spec_plan`) → scaffold
   (`tia_spec_apply` or the M-off tools) → verify (`tia_compile`) → human-gated deploy
   (`tia_download` with dryRun → human approval → `approved:true` + the same `planHash`).
5. **Some CPU settings are GUI-only** (PUT/GET permission, OPC UA runtime license,
   OPC UA server interface). Hitting one is EXPECTED, not a bug: relay the exact GUI
   steps from `tia_guide {"topic":"gui-gates"}` and resume after the human confirms.
6. **Prerequisites:** the serve must be running (default `http://localhost:5000` —
   check with `tia_ping`); the FIRST connect per serve process hits the G1 trust dialog
   on the serve host.
7. **Long operations are jobs.** A tool whose description says "Long operation" (connect,
   compile, download, upload, project create/save/archive, exports, CAx…) may answer `status:"running"` with a
   `jobId` — the operation is STILL running on serve. Call `tia_job_status {jobId}`
   until it returns the final result; never repeat the original call. While a job runs,
   any OTHER ordinary serve-bound tool answers `kind:"busy"` (with `details.jobId`) — that is
   expected, not a failure: go back to `tia_job_status`. Offline tools (`tia_guide`,
   `tia_spec_validate`, `tia_spec_plan`, `tia_job_status` itself) never answer busy.
   `tia_ping` is the diagnostic exception: it probes `/health`, which bypasses the busy guard,
   and returns a reachability report (`reachable:true`, `activated:null` while a job runs) with
   no top-level `kind` and no `details.jobId` — use it to check reachability, never to obtain the job ID.

Session start: `tia_ping` → `tia_status` → (if needed) `tia_start` / `tia_connect`.
Before the first build on a project: read `tia_guide {"topic":"pipeline"}` and
`tia_guide {"topic":"gotchas"}`.

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
  dry-run→approve, idempotency by name, `OrderNumber:<MLFB>/V<fw>` format, serial-only.
- Back up a physical CPU with the **`tia.backup`** skill (dedicated empty project; the upload
  token is bound to the project shown in the handoff).
- **Picking the G3 download path (no gate, no scan):** `tia_pg_interfaces` lists the connection
  modes/PG-PC interfaces TIA already sees for the CPU (plus the OS status of each adapter) —
  use it to fill `connectionMode`/`pcInterfaceName`/`targetInterfaceName` for `tia_download`
  instead of reaching for `tia_accessible_devices` (a real network scan, GATE G7).
- **GUI-ONLY settings (NOT exposed via Openness — surface as a human gate, do not script):**
  "Permit access with PUT/GET communication", OPC UA **runtime license** / server-interface
  creation. (OPC UA server **activation** is the exception — settable via Openness with
  `tia_obj_set_attributes {OpcUaServer:true}` on the "OPC UA" device-item.)

**Deploy-time approval gates** (download / online / network-scan / secret / safety = **G3/G4/G7/G6/G5**)
are a *different* class — see the **`tia.handoff`** skill. Those are "a human **approves an action**",
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

**Not a gate (now scriptable):** *activating* the OPC UA server — `tia_obj_set_attributes {OpcUaServer:true}`
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
   working project FIRST: `tia_project_create` CLOSES the current project without saving, so
   `tia_project_save` + `tia_project_archive` before creating the backup project — and pass the
   archive `name` WITH the `.zap21` extension (`name` absent or extension-less fails; with
   `.zap21` it archived 1.6 MB).
8. **One wrong know-how password can lock a block for the session.** Observed on the bench
   (2026-10-12): after one rejected unprotect (`tia_block_protect {protect:false}`), TIA refused
   the CORRECT password of that block for the rest of the session (cause not confirmed — possibly
   brute-force protection). Never retry with a guess — ask the human for the password (G6); if a
   password the human confirms is refused, stop and hand off instead of retrying.

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
| 4 | Handoff / deploy | `tia_download` | GATE G3 | `dryRun:true` asks serve for a VERIFIED plan (clean compile, resolved connection, software fingerprint) → plan + `planHash` → a HUMAN approves → re-call with `approved:true` + the SAME `planHash` (serve re-checks the fingerprint and refuses `plan_stale` if the software changed). The approval covers the connection/options and the covered software content — NOT the hardware configuration (a hardware change after approval passes the token check). Re-plan (new dryRun) + fresh human approval only when the hardware configuration changed AFTER the dryRun that produced the token — the fingerprint cannot detect that change, so the human must confirm nothing hardware-side moved; never reuse the old token for changed hardware. Fingerprint limits: user program blocks, UDTs and tag tables only — no hardware configuration, system block groups, S7-1500 software units or technology objects; per-object fallback to modification dates (`source:"dates"`, warned in the plan — dates can false-positive `plan_stale`). Never self-approve. Pick the connection with `tia_pg_interfaces` (no scan). |

Scaffold order (dependency-correct): subnets → devices (CPUs first) → modules →
network/IP/IO-system → protection recipe (`tia_guide {"topic":"recipes"}`) → tag
tables → tags → constants → UDTs BEFORE dependent blocks → FB shells + instance DBs →
logic (SCL/STL via `tia_source_put`; LAD/FBD/GRAPH via `tia_import_xml` — Gd6 format
routing) → `tia_compile`.

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

## After scaffolding

- Re-run `tia_compile` after ANY authoring change.
- `tia_project_save` regularly; `tia_project_archive` BEFORE risky operations
  (firmware change — see `tia_guide {"topic":"gotchas"}`).
- Auditing an existing project is class R: read blocks/types/tags via `tia_plc_*` and
  check the engineering baseline (optimized access, 100% symbolic, UDT-typed
  interfaces, FB + instance-DB, uniform naming).
- **The project matches what's versioned — prove it, don't assume it.** A raw hash of an
  export is NOT proof (two exports of the same block differ in `<Created>`/UIds). Use
  `tia_export_block` to pull a block inline and `tia_block_compare` to diff it against the
  committed XML (normalized — ignores formatting/BOM/`<Created>`/UIds); `verdict:"equal"` is
  the actual round-trip proof. After `tia_compile`/`tia_source_put`, read `blockChanges` and
  export/commit any regenerated instance DBs before calling the project verified.

## Libraries, HMI, CAx and PLC security

Reads are class R; every change is class M-off (offline, with `dryRun`) and reaches the CPU
only through a later `tia_compile` + human-gated `tia_download` (G3). Every file path is a
path ON THE SERVE HOST.

- **Project library:** `tia_library_mastercopies` / `tia_library_types` read it;
  `tia_library_mastercopy_create` turns a DEVICE into a master copy (a block cannot be a source).
  `tia_block_from_mastercopy` needs a master copy that holds PLC blocks — a device copy is
  refused (`409 mastercopy_not_blocks` after app 1.6.3; up to 1.6.3 a 500).
- **Global libraries** live in the TIA Portal session, not the project: `tia_global_libraries`,
  `tia_global_library_create` / `_open` / `_save` / `_close`. Save/close take the name from
  `tia_global_libraries` (exact name first, then ignoring case). After app 1.6.3 a name that
  picks no single open USER library is refused, nothing saved or closed: `404 not_found`
  (`details.userLibraries` lists the names that work), or `409 conflict` for a read-only
  system/corporate library or a name several user libraries match only ignoring case; up to
  1.6.3 the serve reports success even for an unknown name.
- **HMI:** `tia_hmis` and `tia_hmi_screens` read any HMI; screen files
  (`tia_hmi_screen_export`, `tia_hmi_screens_import`) work for WinCC **Classic** only, and the
  import OVERWRITES same-named screens.
- **CAx (AutomationML):** `tia_cax_export` (one device or the whole project) and
  `tia_cax_import` (`option`: `RetainTiaDevice` default / `OverwriteTiaDevice` /
  `MoveToParkingLot`). Archive the project before an overwrite. A failed transfer is an error
  (`500 cax_transfer_failed`) after app 1.6.3; up to 1.6.3 the serve returns an opaque
  `result` even on failure — check the devices with `tia_devices`.
- **PLC security:** `tia_certificates` / `tia_certificate_template` / `tia_password_policy`
  read; `tia_certificate_import` / `_export` / `_delete`, `tia_password_policy_set` and
  `tia_block_protect` change the project. **G6:** a block or certificate password and the
  password-policy values come from a HUMAN — never invent, guess or reuse one; dryRun plans
  show a password as `[redacted]`. A CPU without the certificate manager or a policy service
  answers 409.
- **Multiuser:** `tia_local_sessions` lists the local sessions (empty in a single-user project).

---

# Recipes (runtime-verified) & scaffold order

## Pipeline order (dependency-correct)

`tia_spec_apply` already encodes this; use it manually only when the spec maps imperfectly.

1. **Subnets** (`tia_subnet_create`) — before connecting devices to them.
2. **Devices** (`tia_device_create`, `OrderNumber:<MLFB>/V<fw>`) — CPUs first.
3. **Modules** (`tia_device_plug`) — into existing devices, by slot.
4. **Network** (`tia_network_connect`, IP, `createIoSystem`) — CPU + its IO-devices on the
   **same** subnet; exactly one `createIoSystem` per IO-system.
5. **Protection recipe** (below) — so the CPU can compile clean.
6. **Tag tables** (`tia_tagtable_create`) → **tags** (`tia_tag_create`) → **constants**.
7. **UDTs first** (`tia_types_import`), **then** blocks that use them.
8. **Blocks** — FB shells (`tia_fb_create`) + instance DBs (`tia_instancedb_create`);
   logic via `tia_source_put` (SCL) or `tia_import_xml` (LAD/FBD/GRAPH). Gd6 format routing.
9. **Compile** (`tia_compile`) — the verifier; only `Error` blocks. It compiles the **software**
   scope (not just the CPU device item), so it makes freshly-generated blocks consistent and, in
   most cases, **regenerates** any instance DB left inconsistent by an FB interface change.
   **Recompile first**; only if the DB still reports inconsistent after a compile, delete it
   (`tia_block_delete`), recreate it (`tia_instancedb_create`) and recompile.

## Recipe — unlock a freshly-created CPU so it compiles clean (VERIFIED V21, firmware-dependent)

A bare CPU added via Openness may fail `compile` with **protection** errors: the
*confidential-PLC-configuration-data* password is unset, the *communication certificate*
can't be generated without it, and (on newer firmware) the *access control* defaults to a
protected level needing a password. **The recipe differs by CPU family/firmware — there is
no single universal form.** Fix, in order:

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

### Open policy — who supplies the confidential password

`Protect()` sets an **offline project** password (it is not the online master secret / G6).
The repo docs treat it as offline authoring ("no human needed"), but it protects confidential
config data — so this is a **harness policy decision**: either (a) the human/spec supplies it
(`spec.security.confidentialPassword`), or (b) the harness uses a documented project default.
Default to asking the human if the spec doesn't carry it; never invent a *secret the user
must later know* silently. The online master secret (`tia_mastersecret_set`, G6) is **always**
human-supplied.

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
# find the CPU device-item handle:
tia_obj_roots                                  -> the device handle (role:"device")
tia_obj_items { handle:<device>, composition:"DeviceItems" }   -> the CPU item handle (not the rack)
# change the CPU's type to the SAME MLFB with the target /V<fw> suffix:
tia_obj_invoke { handle:<cpu>, name:"ChangeType",
                 args:["OrderNumber:6ES7 214-1HG40-0XB0/V4.4"] }
# then recompile — a regenerated FB may need a fresh compile before download:
tia_compile { ... }
```

- **Rule: `project FW ≤ device FW`** — never set the project firmware **higher** than the physical
  device's (download would be rejected). Bumping the project *up to* the device FW is the safe move.
- Keep the **same MLFB**, swap only the `/V<fw>` suffix. The program (blocks/tags) survives.
- After `ChangeType` the CPU/blocks can be inconsistent; **always recompile** before any handoff.
- **⚠️ `ChangeType` RESETS GUI-gated comm settings** (runtime-validated on the 1214C): it **disabled
  the OPC UA server** (`OpcUaServer`→`false`) and **cleared the OPC UA runtime-license** selection
  (the custom server interface and PUT/GET *survived*). So **`tia_project_archive` first** on a CPU
  with hand-configured OPC UA/PUT-GET, and **re-verify after**. Recovery: `tia_obj_set_attributes
  {OpcUaServer:true}` on the "OPC UA" device-item (it **is** writable; re-select the license in the
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
   **human gate** and surface it in `tia.handoff`; do **not** attempt to script it.
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
   scriptable via Openness: `tia_obj_set_attributes` `{OpcUaServer:true}` on the "OPC UA"
   device-item — it auto-generates the server certificate. Steps 2–3 stay GUI-only.)*
2. **Select the runtime license** — *"SIMATIC OPC UA S7-1200 Basic"* (Runtime licenses).
3. **Create a server interface** that **exposes the DB** — the **S7-1200 does NOT auto-expose**
   tags/DBs to OPC UA (unlike the S7-1500), so you must add a server interface and place the DB
   nodes in it manually.

**Finding the node IDs (client side):** browse `ns=3;s=ServerInterfaces` with any OPC UA client;
the actual data nodes show up under **`ns=4`**. Use those node IDs from the backend.

> What Openness *can* still do here: create the DB/blocks, compile, download — **and activate the OPC UA
> server** (step 1: `tia_obj_set_attributes {OpcUaServer:true}`; do NOT gate it on a human). Only **three**
> items are truly human/GUI: the **runtime license**, the **server interface** — and **PUT/GET** in the S7
> recipe. See `docs/TIA-Openness-Casos-de-Uso.md` §8c for the full "GUI-only gates" table.

## Where to stop

Everything above is **offline (M-off)**. `tia_download` / `tia_online` (G3/G4) are **not**
part of scaffold — they belong to `tia.handoff` and require explicit human approval.

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
