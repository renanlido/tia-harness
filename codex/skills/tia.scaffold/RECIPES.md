# tia.scaffold — recipes (verified) & pipeline order

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
   scope (not just the CPU device item), so it makes freshly-generated blocks consistent **and
   regenerates** any instance DB left inconsistent by an FB interface change — re-compile, never
   delete/recreate the instance DB.

## Recipe — unlock a freshly-created CPU so it compiles clean (VERIFIED, V21 / S7-1500 V2.9)

A bare CPU added via Openness fails `compile` with **protection** errors (verified
2026 against a real S7-1500 1516-3 V2.9 — 3 errors): the *confidential-PLC-configuration-
data* password is unset, the *communication certificate* can't be generated without it,
and the *access level* defaults to a protected level needing a password. Fix, in order:

**(1) Confidential-data password → also auto-generates the certificate** (clears 2 of 3):

```
# find the CPU device-item handle:
tia_obj_roots                                  -> the device handle (role:"device")
tia_obj_items { handle:<device>, composition:"DeviceItems" }   -> the CPU item handle
# acquire the service ON THE CPU MODULE (not the rack) and invoke Protect:
tia_obj_service  { handle:<cpu>, type:"Siemens.Engineering.HW.Features.PlcMasterSecretConfigurator" }  -> <svc>
tia_obj_invoke   { handle:<svc>, name:"Protect", args:["<password>"] }
```

**(2) Access level → FullAccess** (clears the 3rd; the legacy model on FW < 3.1):

```
tia_obj_set_attributes { handle:<cpu>, attributes:{ "PlcProtectionAccessLevel":"FullAccess" } }
```

Then `tia_compile` → `state: Warning, errors: 0` (the 2 warnings — CPU-display password —
are benign and do **not** block; Gd8).

> **CORRECTION for V21:** the older recipe `PlcAccessControlConfiguration="Disabled"` returns
> **HTTP 500** on V21 (that attribute is not on the CPU item). Use `PlcProtectionAccessLevel`.
>
> **Requires the `tia_obj_service` tool** (acquire `GetService<T>` → handle). Without it the
> MCP cannot run step 1.

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
> existing **instance DB goes inconsistent** (its interface no longer matches the FB). The fix that
> works is **delete + recreate** the instance DB, then recompile:
>
> ```
> tia_block_delete    { ... the stale instance DB ... }
> tia_instancedb_create { ... fresh instance DB for the FB ... }
> tia_compile         { ... }
> ```
>
> (This differs from the §Pipeline note about *recompiling* a system-regenerated instance DB:
> here the FB interface was **edited** via source, so recreate beats recompile.)

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

Then, the GUI gate sequence (all **human**, none exposed by Openness on this CPU/FW — we tried
`CommunicationManagement` and `OpcUaUserManagement→404`):

1. **Activate the OPC UA server** — *Properties → OPC UA → Server* (enable). *(This step **is**
   scriptable via Openness: `tia_obj_set_attributes` `{OpcUaServer:true}` on the "OPC UA"
   device-item — it auto-generates the server certificate. Steps 2–3 stay GUI-only.)*
2. **Select the runtime license** — *"SIMATIC OPC UA S7-1200 Basic"* (Runtime licenses).
3. **Create a server interface** that **exposes the DB** — the **S7-1200 does NOT auto-expose**
   tags/DBs to OPC UA (unlike the S7-1500), so you must add a server interface and place the DB
   nodes in it manually.

**Finding the node IDs (client side):** browse `ns=3;s=ServerInterfaces` with any OPC UA client;
the actual data nodes show up under **`ns=4`**. Use those node IDs from the backend.

> What Openness *can* still do here: create the DB/blocks, compile, download. Only the four gate
> items above (activate server, license, create server interface — and PUT/GET in the S7 recipe)
> are human/GUI. See `docs/TIA-Openness-Casos-de-Uso.md` §8c for the full "GUI-only gates" table.

## Where to stop

Everything above is **offline (M-off)**. `tia_download` / `tia_online` (G3/G4) are **not**
part of scaffold — they belong to `tia.handoff` and require explicit human approval.
