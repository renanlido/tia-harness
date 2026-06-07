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
9. **Compile** (`tia_compile`) — the verifier; only `Error` blocks.

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

## Where to stop

Everything above is **offline (M-off)**. `tia_download` / `tia_online` (G3/G4) are **not**
part of scaffold — they belong to `tia.handoff` and require explicit human approval.
