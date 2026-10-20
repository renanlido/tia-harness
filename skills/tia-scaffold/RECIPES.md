# tia-scaffold — recipes (verified) & pipeline order

## Contents

- Pipeline order (dependency-correct)
- Recipe — edit an existing block or type without overwriting a newer change (stale-write guard)
- Recipe — unlock a freshly-created CPU so it compiles clean (VERIFIED V21, firmware-dependent)
- S7 connection precondition (G2)
- Recipe — bump the project firmware in-place (keeps the program) (VERIFIED, V21 / S7-1200 1214C)
- Recipe — enable a Modbus TCP server (`MB_SERVER`) on the S7-1200 (VERIFIED, FW V4.0)
- Recipe — enable S7 / PUT-GET on the S7-1200 (port 102)
- Recipe — enable OPC UA on the S7-1200 (port 4840)
- Recipe — WinCC Unified HMI: read, then guarded writes
- Recipe — diff a project against a VCI workspace, or round-trip a block through a new one
- Reference — global library and CAx error contracts (by app version)
- Reference — download plan fingerprint limits
- Recipe — generate the FAT/SAT I/O list (tia_io_map)
- Recipe — prove the project matches the versioned XML (tia_block_compare)
- Reference — network, audit and CAx how-to
- Where to stop

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
