# TIA Portal Automation Harness — Codex port

A port of the **`tia` harness** (originally a Claude Code plugin) to **OpenAI Codex** (CLI + IDE
extension). It is an industrial-automation + **Siemens TIA Portal V21** specialist harness: it turns
a structured engineering **project-spec** into a *compliant-by-construction*, *verified* TIA project
by driving the **`tia` MCP server** over the project's Openness HTTP `serve` — while keeping the model
an **assistant up to the gate, never an autonomous commissioner**.

The source of truth is [`../.claude-plugin/`](../.claude-plugin/). This directory mirrors the same
technical content (gates vs guards, the `tia_*` tool map, the GUI-gate table, the hard-won gotchas,
the CPU table and recipes) adapted to Codex's formats. Keep the technical content in sync with the
Claude Code plugin; only the file format and vocabulary differ here.

## What's in here

```
codex/
├─ AGENTS.md                          # operating guide (port of .claude-plugin/CLAUDE.md)
├─ agents/                            # subagents as TOML (name, description, developer_instructions)
│  ├─ tia-engineer.toml              # offline program authoring
│  ├─ hardware-architect.toml        # CPU / modules / network
│  ├─ verifier.toml                  # verification ladder (rungs 0-3)
│  └─ safety-reviewer.toml           # READ-ONLY F review (nothing autonomous)
└─ skills/                           # skills as SKILL.md + auxiliary files (carried over verbatim)
   ├─ spec.validate/   SKILL.md  RULES.md  examples/line2.valid.json
   ├─ cpu.select/      SKILL.md  CPU-TABLE.md
   ├─ spec.plan/       SKILL.md
   ├─ tia.review/      SKILL.md  BASELINE.md
   ├─ tia.scaffold/    SKILL.md  RECIPES.md
   ├─ tia.verify/      SKILL.md
   ├─ tia.handoff/     SKILL.md
   └─ tia.init/        SKILL.md
```

## Install

Three pieces — subagents, skills, and the operating guide — plus the `tia` MCP server.

1. **Subagents** → copy `agents/*.toml` into `~/.codex/agents/`:

   ```powershell
   Copy-Item codex\agents\*.toml $env:USERPROFILE\.codex\agents\
   ```

2. **Skills** → copy each `skills/<name>/` folder (with its auxiliary files) into `~/.agents/skills/`:

   ```powershell
   Copy-Item codex\skills\* $env:USERPROFILE\.agents\skills\ -Recurse
   ```

3. **Operating guide** → put `AGENTS.md` where Codex reads it: globally as `~/.codex/AGENTS.md`, or
   per-project as `AGENTS.md` at the repo root.

   ```powershell
   Copy-Item codex\AGENTS.md $env:USERPROFILE\.codex\AGENTS.md
   ```

4. **The `tia` MCP server** → wire it via `~/.codex/config.toml`. **Single source of installation:**
   see [`../docs/INSTALL.md`](../docs/INSTALL.md) → section **Codex** for the exact `[mcp_servers.tia]`
   stanza (note: env in a sub-block `[mcp_servers.tia.env]`), the `codex mcp add` CLI form, and the
   `TIA_API_BASE` value. Do not duplicate those steps here — INSTALL.md is the canonical guide.

> The MCP is a **pure HTTP client** of the `serve` API (the Windows app that drives TIA Portal).
> Point it at the `serve` host via `TIA_API_BASE` (default `http://localhost:5000`). The two pure
> class-R skills (`spec.validate`, `cpu.select`) work even before the MCP / `serve` are up.

## What maps 1:1 and what differs

Maps **1:1** from the Claude Code plugin (same technical content):

- **Subagents** — the 4 roles (tia-engineer, hardware-architect, verifier, safety-reviewer) and
  their role/guardrails/when-to-use. The Markdown frontmatter becomes Codex **TOML** keys: `name`,
  `description`, and `developer_instructions` (the multiline system prompt). Optional `model` /
  `mcp_servers` keys are available but unused by default.
- **Skills** — the 8 skills carry over as `SKILL.md` with YAML frontmatter, plus every auxiliary
  file (`RULES.md`, `RECIPES.md`, `CPU-TABLE.md`, `BASELINE.md`, `examples/`) copied verbatim. The
  gates/guards, the `tia_*` tool names, and the verified bare-CPU recipe are preserved as-is.
- **Operating guide** — `CLAUDE.md` → `AGENTS.md`, same gates-vs-guards model, GUI-gate table, and
  gotchas.

What **differs** (format only):

- Subagents are **TOML** (`developer_instructions` as the system prompt) instead of Markdown with
  frontmatter.
- The operating guide is named **`AGENTS.md`** and lives under `~/.codex/` (or the project root)
  instead of `CLAUDE.md`.
- Skills install under **`~/.agents/skills/`** and subagents under **`~/.codex/agents/`** — the
  standard Codex locations. There is no marketplace install; copy the folders.
- The `tia` MCP is registered in **`~/.codex/config.toml`** (TOML, `[mcp_servers.tia]`) rather than a
  plugin manifest — see [`../docs/INSTALL.md`](../docs/INSTALL.md).

## Reminder — gates, guards, serial-only

The harness encodes **gates** (human-only: trust dialog G1, download/CPU-STOP G3, go-online G4,
network scan G7, master-secret G6, safety/F G5 — never autonomous) and **guards** (tool-enforced:
compile-clean before deploy, dry-run→approve, idempotency by name, `OrderNumber:<MLFB>/V<fw>`,
**serial-only**). The `serve` backend is a **single serial worker** — never parallelize `tia_*`
calls. See [`AGENTS.md`](AGENTS.md) for the full gates/guards model, the GUI-gate handoff table, and
the gotchas.
