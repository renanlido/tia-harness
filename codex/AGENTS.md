> **Nota:** Espelha [`.claude-plugin/CLAUDE.md`](../.claude-plugin/CLAUDE.md) (fonte canônica) — mantenha em sync.

# Working with the TIA Portal Automation Harness

## What this harness is

This project uses the **TIA Portal Automation Harness** — a Codex harness (skills + subagents)
that drives **Siemens TIA Portal V21** via the **`tia` MCP** over the project's Openness HTTP
`serve`. It turns a structured engineering **project-spec** into a *compliant-by-construction*,
*verified* TIA project. The harness ships skills — `spec.validate`, `cpu.select`, `spec.plan`,
`tia.review`, `tia.scaffold`, `tia.verify`, `tia.handoff` — plus subagents (tia-engineer,
hardware-architect, verifier, safety-reviewer). The model is an **assistant up to the gate,
never an autonomous commissioner**.

The harness pieces live in standard Codex locations:

- **Skills** in `~/.agents/skills/<name>/SKILL.md` (each with its YAML frontmatter + auxiliary
  files like `RULES.md`/`RECIPES.md`/`CPU-TABLE.md`/`BASELINE.md`).
- **Subagents** in `~/.codex/agents/<name>.toml` (tia-engineer, hardware-architect, verifier,
  safety-reviewer).
- **The `tia` MCP** wired via `~/.codex/config.toml`. See [../docs/INSTALL.md](../docs/INSTALL.md)
  for the exact install/config steps.

## Prerequisites

- The **`tia` serve must be running** (default `http://localhost:5000`, e.g.
  `TIAOpenness.exe serve 5000`). The MCP is a pure HTTP client; point it at the serve host via
  `TIA_API_BASE` if it runs elsewhere.
- The Windows user must belong to the **"Siemens TIA Openness"** local group.
- The **FIRST connection per serve process shows a trust dialog** that a **human must confirm**
  ("Yes to all") on the serve host — this **cannot be automated** (gate G1).

## MCP tools map (`tia_*`)

- **Lifecycle:** `tia_start`, `tia_connect`, `tia_show_ui`, `tia_status`.
- **Read-only (class R):** `tia_plcs`, `tia_plc_blocks`, `tia_plc_tags`, `tia_obj_*`
  (`tia_obj_roots`/`items`/`get`/`info`/`service`/`invoke`…).
- **Authoring (M-off, offline):** `tia_source_put` (SCL/STL), `tia_import_xml` (LAD/FBD/GRAPH),
  `tia_device_create`, `tia_device_change_version` (in-place firmware change, keeps the
  program), `tia_instancedb_create`, `tia_block_delete`, `tia_tag_create`,
  `tia_tagtable_create`, `tia_subnet_create`, `tia_network_connect`…
- **Deploy (gated):** `tia_compile` = the offline verifier; `tia_download` = **GATE G3**.
- **Spec:** `tia_spec_validate`, `tia_spec_plan`, `tia_spec_apply`.

## GATES vs GUARDS

- **GATES (human-only — never auto-bypass):** trust dialog (**G1**), download / CPU-STOP
  (**G3**), go-online (**G4**), network scan / accessible-devices (**G7**), master-secret/UMAC
  (**G6**), **safety / F-logic (G5) — never autonomous**.
- **GUARDS (tool-enforced preconditions):** compile-clean before deploy, consistency,
  dry-run→approve, idempotency by name, `OrderNumber:<MLFB>/V<fw>` format, serial-only.
- **GUI-ONLY settings (NOT exposed via Openness — surface as a human gate, do not script):**
  "Permit access with PUT/GET communication", OPC UA **runtime license** / server-interface
  creation. (OPC UA server **activation** is the exception — settable via Openness with
  `tia_obj_set_attributes {OpcUaServer:true}` on the "OPC UA" device-item.)

## Human interaction points (GUI gates) — EXPECTED, not an error

Some TIA settings are **not reachable via Openness** on the S7-1200/1500. The harness will hit a
signal that *looks* like an error but is actually a point where a **human must act in the TIA GUI**.
When you see one of these, **do not treat it as a failure and do not retry blindly** — recognize it,
tell the human the **exact GUI steps**, and resume after they confirm. A GUI gate is a *handoff*, not a *bug*.

| # | Signal you'll see | Why it's expected | Tell the human (exact GUI steps) |
|---|---|---|---|
| **G1 trust** | `tia_connect` → `requires_human_action` (`trust_dialog`), or the **1st** connect per `serve` process hangs ~30 s | TIA shows a one-time security prompt the first time an Openness app attaches, **per process** | On the **serve host**, in TIA Portal, click **"Yes to all"** in the access dialog. *Caveat:* it can false-positive on a client timeout with **no** real dialog — check `tia_status` (`attached:true`) and just resume. |
| **OPC UA license** | `tia_compile` **ERROR**: *"The selected OPC UA license is not sufficient…"* | License selection is GUI-only (no Openness service); a fresh project **or a firmware change** leaves it unset | CPU → **Properties → General → Runtime licenses → OPC UA** → *Type of required license* → select **"SIMATIC OPC UA S7-1200 Basic"** (the 1214C option). Recompile. |
| **OPC UA interface** | OPC UA client connects but the DB nodes aren't there (`ns=4` empty / no `ServerInterfaces`) | The **S7-1200 does NOT auto-expose DBs** (unlike the S7-1500) — a server interface must be created by hand | CPU → **OPC UA → Server interfaces → Add new server interface** → add/drag the DB (e.g. `ModbusData`) into it. Recompile; data appears under `ns=4`. |
| **PUT/GET** | S7 client (`nodes7`/`snap7`) connects on port 102 but reads return access-denied (`ROSCTR=2` / "BAD") | *"Permit access with PUT/GET"* is a GUI-only protection setting | CPU → **Properties → Protection & Security → Connection mechanisms** → check **"Permit access with PUT/GET communication from remote partner"**. Compile + download (`hardware:true`). |
| **FW-change reset** | After `tia_device_change_version`: OPC UA server off, the license error on compile, blocks `isConsistent:false` | `DeviceItem.ChangeType` **resets GUI-gated comm settings** (server activation + license); the interface & PUT/GET survive | `tia_project_archive` **before** the FW change. After: re-set `OpcUaServer:true` via `tia_obj_set_attributes` (scriptable), re-select the license (row above), recompile. |

**Not a gate (now scriptable):** *activating* the OPC UA server — `tia_obj_set_attributes {OpcUaServer:true}`
on the "OPC UA" device-item (it auto-generates the server certificate). Only the **license** and the
**server interface** stay GUI-only.

**Deploy-time approval gates** (download / online / network-scan / secret / safety = **G3/G4/G7/G6/G5**)
are a *different* class — see the **`tia.handoff`** skill. Those are "a human **approves an action**",
not "a human **clicks a GUI setting**". Both are human interaction points; surface them as
`requires_human_action` with concrete guidance, never as a tool failure.

## Hard-won gotchas

1. **Always compile before deploy.** `tia_compile` aggregates **hardware + software**; a
   **clean** compile (`errors:0`) is the precondition for download and for S7 connections.
2. **The serve is a SINGLE serial worker** — one Openness op at a time. Do **not** fire
   concurrent `tia_*` calls; a hung Openness op can stall the serve (may need a restart).
3. **Regenerating an FB via `tia_source_put` leaves its instance DB inconsistent** → delete it
   (`tia_block_delete`) and recreate (`tia_instancedb_create`), then recompile.
4. **Firmware rule: project FW ≤ device FW.** Bump the project FW **in-place** with
   `tia_device_change_version` (`DeviceItem.ChangeType`), which preserves the **program** — never
   set the project higher than the physical CPU. **⚠️ It RESETS GUI-gated comm settings** (the
   **OPC UA server activation** + **runtime-license**; the server interface and PUT/GET survive):
   **archive first** (`tia_project_archive`) on a CPU with hand-configured OPC UA, recompile after
   (it marks blocks inconsistent), and re-verify. Same-version `ChangeType` is rejected.
5. **Use a NON-optimized DB** for Modbus (`MB_HOLD_REG`) and S7 (absolute addressing); OPC UA
   works with optimized or not.
6. **Order numbers use `/V<fw>`, not `:V<fw>`** (guard Gd5).

## Worked examples

The three communication scenarios control one **S7-1200 LED** from a web app via a shared DB,
each over a different protocol — **Modbus TCP**, **S7 PUT/GET**, and **OPC UA** (browser →
Node backend → protocol → PLC). See `docs/COMM-SCENARIOS.md` and
the runnable backends/apps under `comm-scenarios/` (`modbus/`, `s7/`,
`opcua/`).
