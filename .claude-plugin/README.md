# TIA Portal Automation Harness — Claude Code plugin (scaffold)

An industrial-automation + **Siemens TIA Portal V21** specialist harness, packaged as a
**Claude Code plugin**. It turns a structured engineering **project-spec** into a
*compliant-by-construction*, *verifiable* TIA project by driving the **`tia` MCP server**
over the project's Openness HTTP API — while keeping the model an **assistant up to the
gate, never an autonomous commissioner**.

This directory is the harness skeleton. The professional methodology it distills —
program architecture, hardware/network rules, the verification ladder, and the
gates/guards model — is bundled next to each skill (`BASELINE.md`, `RULES.md`,
`RECIPES.md`, `CPU-TABLE.md`).

## Install (Claude Code marketplace)

This repo is **both the plugin and its own marketplace** (`.claude-plugin/marketplace.json`).
In Claude Code:

```text
/plugin marketplace add renanlido/TIAOpenness
/plugin install tia-harness@tia-openness
/reload-plugins
```

Installing **auto-registers the bundled `tia` MCP server** (it runs
`npx -y @renanlido/tia-openness-mcp`) — so you need **Node 20+** on PATH and the npm package
**published**. Point it at your `serve` host via `TIA_API_BASE` (default `http://localhost:5000`;
use the VM IP if `serve` runs elsewhere). The two pure R skills (`spec.validate`, `cpu.select`)
work even before the MCP / `serve` are up.

> `source` is `"./"` (this repo's root `.claude-plugin/` IS the plugin), per the official
> marketplace convention (source = the directory that *contains* `.claude-plugin/`). If a future
> Claude Code build resolves it differently, that single field is the only thing to adjust.

## What's in here

```
.claude-plugin/
├─ plugin.json                     # plugin manifest: skills, agents, and the `tia` MCP server config
├─ README.md                       # this file
├─ schemas/
│  └─ project-spec.schema.json     # JSON Schema (Draft 2020-12) for the project-spec (§13.2)
├─ skills/
│  ├─ spec.validate/               # validate a spec vs schema + cross-field rules (class R, NO MCP)
│  │  ├─ SKILL.md  RULES.md  examples/line2.valid.json
│  ├─ cpu.select/                  # recommend a CPU + MLFB from needs (class R, NO MCP)
│  │  └─ SKILL.md  CPU-TABLE.md
│  ├─ spec.plan/                   # spec → ordered dry plan (class R; tia_spec_validate/plan, pure)
│  │  └─ SKILL.md
│  ├─ tia.review/                  # audit an open project vs the baseline (class R, read-only)
│  │  └─ SKILL.md  BASELINE.md
│  ├─ tia.scaffold/                # build a project FROM a spec (class M-off; pipeline + R7 recipe)
│  │  └─ SKILL.md  RECIPES.md
│  ├─ tia.verify/                  # verification ladder: compile/consistency/export (class M-off)
│  │  └─ SKILL.md
│  └─ tia.handoff/                 # prepare the gate envelope: download/online/safety (class GATE)
│     └─ SKILL.md
└─ agents/                         # subagent stubs (role + guardrails + when-to-use)
   ├─ tia-engineer.md              # offline program authoring
   ├─ hardware-architect.md        # CPU/modules/network
   ├─ verifier.md                  # verification ladder (rungs 0-3)
   └─ safety-reviewer.md           # READ-ONLY F review (posture F: nothing autonomous)
```

## Skill classes and the MCP runtime

The harness skills split by what they need:

- **Class R, deterministic / read-only.**
  - **`spec.validate`** — schema + cross-field rules (rung 0). Pure, NO MCP.
  - **`cpu.select`** — heuristic CPU/MLFB recommendation over a bundled reference. Pure, NO MCP.
  - **`spec.plan`** — spec → ordered dry plan (`tia_spec_validate`/`tia_spec_plan`, both pure).
  - **`tia.review`** — read-only audit of an **open** project (uses only `tia` *read* tools).
- **Class M-off / GATE — drive the `tia` MCP M3/M4/M5 tools.**
  - **`tia.scaffold`** (create-from-spec pipeline + the verified bare-CPU protection recipe),
    **`tia.verify`** (verification ladder), **`tia.handoff`** (prepare the download/online/safety gates).

The **`tia` MCP now ships M1–M5** (read · lifecycle+G1 · offline creation+guards ·
compile/deploy gated G3–G7 · project-spec validate/plan/apply+G5) and is **runtime-validated**
against a real TIA Portal V21 — so **every skill here is executable**. Install the plugin +
the MCP, point it at a licensed `serve`, and the full **create → verify → handoff** flow runs,
stopping at the human gates by design. The two pure R skills (`spec.validate`, `cpu.select`)
also work fully offline, with no MCP at all.

## The `tia` MCP server

`plugin.json` declares the MCP server `tia`, mirroring the repo-root `.mcp.json`:

```jsonc
"mcpServers": {
  "tia": {
    "command": "tia-openness-mcp",                       // the published MCP bin (mcp/ package)
    "args": [],
    "env": { "TIA_API_BASE": "${TIA_API_BASE:-http://localhost:5000}" }
  }
}
```

- `tia-openness-mcp` is the MCP binary from the `mcp/` package
  (`@renanlido/tia-openness-mcp`, `bin: tia-openness-mcp`). Install it so it is on PATH
  (e.g. `npm i -g @renanlido/tia-openness-mcp`) or adjust `command`/`args` to your
  install.
- `TIA_API_BASE` points the MCP (a **pure HTTP client**) at the `serve` API host. The
  canonical topology is "MCP on your laptop → `serve` on a Windows host/VM with TIA".
- **Auth:** there is **no Bearer token** in this config. API access is gated by the
  host's **activation license**; without a valid license, everything except
  `GET /health` returns `403 license_required`. The MCP sends no key. (A vestigial
  `TIA_API_TOKEN` passthrough may exist in the MCP for compatibility, but it is not used
  here.)
- **Serial-only (Gd1):** the backend is a serial worker — the MCP and these skills must
  **never** parallelize tool calls.

## Guardrails baked into the harness

The harness encodes **gates** (human-only) vs **guards**
(tool-enforced), surfaced so the model produces compliant output instead of relying on
memory:

- **Gates (the harness prepares, a human acts):** first-connect trust dialog (G1);
  download / CPU-STOP approval (G3); go-online / network scan (G4/G7);
  master-secret/UMAC (G6); **safety/F author/modify/download (G5) — never autonomous**.
- **Guards (deterministic):** compile-clean before deploy; consistency; dry-run /
  plan-then-apply; backup-before-mutate; idempotency by **name**; `typeIdentifier =
  OrderNumber:<MLFB>/V<fw>` (slash, not `:V`); block-format routing (SCL↔XML, UDTs
  first); serial-only; **untrusted-input** (spec/SCL/XML never auto-cross a gate).

`spec.validate` is the offline embodiment of several guards (typeIdentifier format,
same-subnet, unique names, module limits, language-by-family, the **G5** safety rule).

## Format assumptions (documented per the task brief)

The exact Claude Code plugin manifest schema may evolve; this scaffold makes the
following **explicit assumptions**, structured cleanly so they are easy to adjust:

1. **Manifest file** is `.claude-plugin/plugin.json`, with `name`, `displayName`,
   `version`, `description`, `author`, plus `skills`, `agents`, and `mcpServers`
   (the same `mcpServers` shape as a Claude Code `.mcp.json`). If your Claude Code build
   expects different keys, the **content** (skill/agent/MCP definitions) is portable —
   only the manifest wiring would change.
2. **Skills** are directories under `skills/<name>/` each containing a `SKILL.md` with
   YAML frontmatter (`name`, `description`) plus optional supporting files (`RULES.md`,
   `CPU-TABLE.md`, `examples/`). Skill names use the dotted form (`spec.validate`,
   `cpu.select`) to match the design docs; if a build requires hyphenated names, rename
   the directory and the `name` field together.
3. **Subagents** are single Markdown files under `agents/<name>.md` with frontmatter
   (`name`, `description`, `tools`). They are **stubs** — role + guardrails + when-to-use
   — not full prompts.
4. **MCP server config** reuses the root `.mcp.json` idea (`command: tia-openness-mcp`,
   `env.TIA_API_BASE`). No secrets are embedded; license/activation lives on the `serve`
   host.
5. **Determinism boundary:** `spec.validate` and `cpu.select` are **class R** and must
   never call the MCP/open TIA. Anything needing the live catalog or the project model is
   deferred to the MCP-backed flows (M1+), surfaced as a hint, not performed in the R
   skills.

## Worked examples

Three end-to-end **communication scenarios** drive one **S7-1200 LED** from a web app via a
shared DB, each over a different industrial protocol — **Modbus TCP**, **S7 PUT/GET**, and
**OPC UA** (browser → Node backend → protocol → PLC). They exercise the harness recipes
(non-optimized DB, in-place firmware bump, the GUI-only gates) on real hardware. See
[../docs/COMM-SCENARIOS.md](../docs/COMM-SCENARIOS.md) for the write-up and the runnable
backends/apps under [../comm-scenarios/](../comm-scenarios/) (`modbus/`, `s7/`, `opcua/`).

## Status

All **7 skills** are specified: `spec.validate`, `cpu.select`, `spec.plan`, `tia.review`
(class R) + `tia.scaffold`, `tia.verify`, `tia.handoff` (M-off / GATE), plus the 4 subagents.
The MCP-backed skills run against the **`tia` MCP M1–M5** (complete + runtime-validated). The
bare-CPU **protection recipe** in `tia.scaffold/RECIPES.md` is the *real, verified* sequence
(`PlcMasterSecretConfigurator.Protect` + `PlcProtectionAccessLevel=FullAccess`), not a
placeholder. Remaining: an end-to-end exercise of `scaffold → verify → handoff` against live
TIA hardware, and PLCSIM (verification-ladder rung 3) is still future.
