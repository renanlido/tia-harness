# TIA Portal Automation Harness — Claude Code plugin (scaffold)

An industrial-automation + **Siemens TIA Portal V21** specialist harness, packaged as a
**Claude Code plugin**. It turns a structured engineering **project-spec** into a
*compliant-by-construction*, *verifiable* TIA project by driving the **`tia` MCP server**
over the project's Openness HTTP API — while keeping the model an **assistant up to the
gate, never an autonomous commissioner**.

This repository is the harness skeleton (the plugin root is the repository root; this directory holds its manifests). The professional methodology it distills —
program architecture, hardware/network rules, the verification ladder, and the
gates/guards model — is bundled next to each skill (`BASELINE.md`, `RULES.md`,
`RECIPES.md`, `CPU-TABLE.md`).

## Install (Claude Code marketplace)

This repo is **both the plugin and its own marketplace** (`.claude-plugin/marketplace.json`).
In Claude Code:

```text
/plugin marketplace add renanlido/tia-harness
/plugin install tia-harness@tia-openness
/reload-plugins
```

Installing **auto-registers the bundled `tia` MCP server** (it runs
`npx -y @renanlido/tia-openness-mcp`) — so you need **Node 20+** on PATH and the npm package
**published**. Installing asks for the **PLCWare API URL** (the `serve` host; default
`http://localhost:5000`, use `http://<vm-ip>:5000` if `serve` runs elsewhere) — see
[Setting the serve URL](#setting-the-serve-url). The two pure R skills (`spec-validate`, `cpu-select`)
work even before the MCP / `serve` are up.

**Alternative, once published: the guided setup.** `npx @renanlido/plcware-setup` connects Claude Code, and also Claude
Desktop, Codex, Gemini CLI, Cursor and VS Code, in one run and **without the plugin**: for Claude Code it adds the `tia`
MCP server at user scope, copies the 9 skills to `~/.claude/skills` and the 4 subagents to `~/.claude/agents` (their tool
names rewritten to `mcp__tia__*`, the standalone form), and adds pre-approval allowances for the 62 read-only (class R)
tools (none for a tool that changes the project or touches the PLC; the permissions you already have stay authoritative).
It records what it adds, so its `uninstall` removes only
that. It is **not published yet**, so the command does not work today: install the plugin as above. Use one route per
agent: the guided setup stops for Claude Code while `tia-harness@tia-openness` is installed.

> `source` is `"./"` (the repo root IS the plugin; `.claude-plugin/` only holds its manifests), per the official
> marketplace convention (source = the directory that *contains* `.claude-plugin/`). If a future
> Claude Code build resolves it differently, that single field is the only thing to adjust.

## Migrating from the dotted skill names

The skills were renamed to the form the Agent Skills spec requires (`a-z`, `0-9` and hyphens; name equal to the
folder). Only the dot became a hyphen; nothing else changed. The old names stop working once you update the plugin.

| Before | After |
|---|---|
| `/tia.review`, `/tia-harness:tia.review` | `/tia-review`, `/tia-harness:tia-review` |
| `tia.scaffold`, `tia.verify`, `tia.handoff`, `tia.backup`, `tia.init` | `tia-scaffold`, `tia-verify`, `tia-handoff`, `tia-backup`, `tia-init` |
| `spec.validate`, `spec.plan`, `cpu.select` | `spec-validate`, `spec-plan`, `cpu-select` |

What to do: update or reinstall the plugin (`/plugin marketplace update tia-openness`, then
`/plugin install tia-harness@tia-openness` and `/reload-plugins`); in each downstream project run `tia-init` again to
refresh the guide block between the `tia-harness:start/end` markers (it still mentions the old names until you do). The
Codex and Gemini ports follow the same rename (`/spec-validate`, `/tia-review`, ... for Gemini commands): copy the new
files over the old folders and delete the dotted ones. The guided setup (once published) does that cleanup for you: it
moves aside the hand-made copies that are exactly a version the public repository released, and puts them back on
`uninstall`; anything you edited is left alone and named.

## What's in here

```
repo root/                        # the plugin root (marketplace `source` is "./")
├─ .claude-plugin/
│  ├─ plugin.json                  # plugin manifest: agents and the `tia` MCP server config
│  ├─ marketplace.json             # marketplace entry (`tia-openness`) for this plugin
│  ├─ README.md                    # this file
│  └─ CLAUDE.md                    # the operating guide (generated: `cd mcp && npm run sync`)
├─ schemas/
│  └─ project-spec.schema.json     # JSON Schema (Draft 2020-12) for the project-spec (§13.2)
├─ skills/
│  ├─ spec-validate/               # validate a spec vs schema + cross-field rules (class R, NO MCP)
│  │  ├─ SKILL.md  RULES.md  examples/line2.valid.json
│  ├─ cpu-select/                  # recommend a CPU + MLFB from needs (class R, NO MCP)
│  │  └─ SKILL.md  CPU-TABLE.md
│  ├─ spec-plan/                   # spec → ordered dry plan (class R; tia_spec_validate/plan, pure)
│  │  └─ SKILL.md
│  ├─ tia-review/                  # audit an open project vs the baseline (class R, read-only)
│  │  └─ SKILL.md  BASELINE.md
│  ├─ tia-scaffold/                # build a project FROM a spec (class M-off; pipeline + R7 recipe)
│  │  └─ SKILL.md  RECIPES.md
│  ├─ tia-verify/                  # verification ladder: compile/consistency/export (class M-off)
│  │  └─ SKILL.md
│  ├─ tia-handoff/                 # prepare the gate envelope: download/online/safety (class GATE)
│  │  └─ SKILL.md
│  ├─ tia-init/                    # inject/refresh the operating-guide block in a project's CLAUDE.md (class R, file-only)
│  │  └─ SKILL.md
│  └─ tia-backup/                  # read a physical CPU into a .zap21 archive (M-off up to G4)
│     └─ SKILL.md
└─ agents/
   ├─ claude/                      # the Claude Code subagents, listed by plugin.json `agents` (source of truth)
   │  ├─ tia-engineer.md           # offline program authoring
   │  ├─ hardware-architect.md     # CPU/modules/network
   │  ├─ verifier.md               # verification ladder (rungs 0-3)
   │  └─ safety-reviewer.md        # READ-ONLY F review (posture F: nothing autonomous)
   └─ *.md                         # the same four in the Gemini CLI format (generated; see below)
```

## Skill classes and the MCP runtime

The harness skills split by what they need:

- **Class R, deterministic / read-only.**
  - **`spec-validate`** — schema + cross-field rules (rung 0). Pure, NO MCP.
  - **`cpu-select`** — heuristic CPU/MLFB recommendation over a bundled reference. Pure, NO MCP.
  - **`spec-plan`** — spec → ordered dry plan (`tia_spec_validate`/`tia_spec_plan`, both pure).
  - **`tia-review`** — read-only audit of an **open** project (uses only `tia` *read* tools).
- **Class M-off / GATE — drive the `tia` MCP M3/M4/M5 tools.**
  - **`tia-scaffold`** (create-from-spec pipeline + the verified bare-CPU protection recipe),
    **`tia-verify`** (verification ladder), **`tia-handoff`** (prepare the download/online/safety gates),
    **`tia-backup`** (back up a physical CPU into a `.zap21` archive).

The **`tia` MCP now ships M1–M5** (read · lifecycle+G1 · offline creation+guards ·
compile/deploy gated G3–G7 · project-spec validate/plan/apply+G5) and is **runtime-validated**
against a real TIA Portal V21 — so **every skill here is executable**. Install the plugin +
the MCP, point it at a licensed `serve`, and the full **create → verify → handoff** flow runs,
stopping at the human gates by design. The two pure R skills (`spec-validate`, `cpu-select`)
also work fully offline, with no MCP at all.

## Setting the serve URL

The plugin takes the `serve` URL from Claude Code's **plugin configuration** (`userConfig`), not
from a shell variable. Installing the plugin from the `/plugin` UI prompts for **PLCWare API URL**
(default `http://localhost:5000`). Non-interactive installs do not prompt; pass it explicitly:

```bash
claude plugin install tia-harness@tia-openness --scope user --config tia_api_base=http://<vm-ip>:5000
```

Change it later with `/plugin configure tia-harness@tia-openness` in Claude Code, then
`/reload-plugins` (or restart). The value is stored under `pluginConfigs` in your Claude Code
`settings.json`.

**Migrating from `TIA_API_BASE`:** an exported `TIA_API_BASE` **no longer drives the plugin**
(the old `${TIA_API_BASE:-http://localhost:5000}` default is gone). If you had it set to a remote
host, set the URL as above once; leaving the variable exported is harmless but ignored by the plugin.
If you configured the `tia` MCP by hand (`claude mcp add ... --env TIA_API_BASE=...`) instead of
via the plugin, nothing changes for that setup.

## The `tia` MCP server

`plugin.json` declares the MCP server `tia` and its `userConfig` option (the repo-root
`.mcp.json` keeps a shell-default form for developing inside this repo; for the plugin, the
`plugin.json` entry replaces it by name):

```jsonc
"mcpServers": {
  "tia": {
    "command": "npx",                                    // downloads and runs the published MCP package
    "args": ["-y", "@renanlido/tia-openness-mcp"],
    "env": { "TIA_API_BASE": "${user_config.tia_api_base}" }
  }
},
"userConfig": {
  "tia_api_base": {
    "type": "string",
    "title": "PLCWare API URL",
    "description": "URL of the serve API that drives TIA Portal. ...",
    "default": "http://localhost:5000"
  }
}
```

- `npx -y @renanlido/tia-openness-mcp` runs the published MCP package (`mcp/`); nothing is installed globally and Node 20+
  must be on PATH. Adjust `command`/`args` only to use your own install of the package.
- `TIA_API_BASE` (filled from `userConfig`) points the MCP (a **pure HTTP client**) at the `serve` API host. The
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
  credentials (G6: master secret, UMAC, upload / block / certificate passwords, password
  policy); **safety/F author/modify/download (G5) — never autonomous**.
- **Guards (deterministic):** compile-clean before deploy; consistency; dry-run /
  plan-then-apply; backup-before-mutate; idempotency by **name**; `typeIdentifier =
  OrderNumber:<MLFB>/V<fw>` (slash, not `:V`); block-format routing (SCL↔XML, UDTs
  first); serial-only; **untrusted-input** (spec/SCL/XML never auto-cross a gate).

`spec-validate` is the offline embodiment of several guards (typeIdentifier format,
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
   `CPU-TABLE.md`, `examples/`). Skill names are hyphenated (`spec-validate`,
   `cpu-select`) and equal to the directory name, as the Agent Skills spec requires; rename
   the directory and the `name` field together.
3. **Subagents** are single Markdown files under `agents/claude/<name>.md` with frontmatter
   (`name`, `description`, `tools`), listed in the manifest field `agents` (Claude Code docs: the field
   replaces the default `agents/` scan). The root `agents/*.md` are the **Gemini CLI** copies, which a
   Gemini extension must read from there; their `tools` is a YAML array of Gemini names, so they are
   generated (`cd mcp && npm run sync`) and never edited by hand. Edit only `agents/claude/`.
4. **MCP server config** reuses the root `.mcp.json` idea (`command: npx`,
   `args: ["-y", "@renanlido/tia-openness-mcp"]`, `env.TIA_API_BASE` filled from `userConfig`). No secrets are embedded; license/activation lives on the `serve`
   host.
5. **Determinism boundary:** `spec-validate` and `cpu-select` are **class R** and must
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

All **9 skills** are specified: `spec-validate`, `cpu-select`, `spec-plan`, `tia-review`
(class R) + `tia-scaffold`, `tia-verify`, `tia-handoff` (M-off / GATE) + `tia-backup` (backup to
`.zap21`, M-off up to G4) + `tia-init` (guide injector, class R), plus the 4 subagents.
The MCP-backed skills run against the **`tia` MCP M1–M5** (complete + runtime-validated). The
bare-CPU **protection recipe** in `tia-scaffold/RECIPES.md` is the *real, verified* sequence
(`PlcMasterSecretConfigurator.Protect` + `PlcProtectionAccessLevel=FullAccess`), not a
placeholder. Remaining: an end-to-end exercise of `scaffold → verify → handoff` against live
TIA hardware, and PLCSIM (verification-ladder rung 3) is still future.
