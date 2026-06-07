# TIA Portal Automation Harness — Gemini CLI port

A port of the **`tia` harness** (originally a Claude Code plugin) to the **Gemini CLI**. It is an
industrial-automation + **Siemens TIA Portal V21** specialist harness: it turns a structured
engineering **project-spec** into a *compliant-by-construction*, *verified* TIA project by driving the
**`tia` MCP server** over the project's Openness HTTP `serve` — while keeping the model an **assistant
up to the gate, never an autonomous commissioner**.

The source of truth is [`../.claude-plugin/`](../.claude-plugin/). This directory mirrors the same
technical content (gates vs guards, the `tia_*` tool map, the GUI-gate table, the hard-won gotchas,
the CPU table and recipes) adapted to Gemini's formats. Keep the technical content in sync with the
Claude Code plugin; only the file format and vocabulary differ here.

## What's in here

```
gemini/
├─ GEMINI.md                          # operating guide (port of .claude-plugin/CLAUDE.md)
├─ agents/                            # subagents as .md (YAML frontmatter + body = system prompt)
│  ├─ tia-engineer.md                # offline program authoring
│  ├─ hardware-architect.md          # CPU / modules / network
│  ├─ verifier.md                    # verification ladder (rungs 0-3)
│  └─ safety-reviewer.md             # READ-ONLY F review (nothing autonomous)
└─ commands/                         # the 8 skills, ported to Gemini custom commands (TOML)
   ├─ spec-validate.toml             # /spec-validate
   ├─ cpu-select.toml                # /cpu-select
   ├─ spec-plan.toml                 # /spec-plan
   ├─ tia-review.toml                # /tia-review
   ├─ tia-scaffold.toml              # /tia-scaffold
   ├─ tia-verify.toml                # /tia-verify
   ├─ tia-handoff.toml               # /tia-handoff
   └─ tia-init.toml                  # /tia-init
```

## Install

Three pieces — subagents, commands, and the operating guide — plus the `tia` MCP server.

1. **Subagents** → copy `agents/*.md` into `~/.gemini/agents/`:

   ```powershell
   Copy-Item gemini\agents\*.md $env:USERPROFILE\.gemini\agents\
   ```

2. **Commands** → copy `commands/*.toml` into `~/.gemini/commands/`:

   ```powershell
   Copy-Item gemini\commands\*.toml $env:USERPROFILE\.gemini\commands\
   ```

3. **Operating guide** → put `GEMINI.md` where Gemini CLI reads it: globally as `~/.gemini/GEMINI.md`,
   or per-project as `GEMINI.md` at the repo root.

   ```powershell
   Copy-Item gemini\GEMINI.md $env:USERPROFILE\.gemini\GEMINI.md
   ```

4. **The `tia` MCP server** → wire it via `~/.gemini/settings.json` (under `mcpServers`). **Single
   source of installation:** see [`../docs/INSTALL.md`](../docs/INSTALL.md) → section **Gemini CLI**
   for the exact `mcpServers` stanza, the `gemini mcp add` CLI form, and the `TIA_API_BASE` value. Do
   not duplicate those steps here — INSTALL.md is the canonical guide.

> The MCP is a **pure HTTP client** of the `serve` API (the Windows app that drives TIA Portal).
> Point it at the `serve` host via `TIA_API_BASE` (default `http://localhost:5000`). The two pure
> class-R commands (`/spec-validate`, `/cpu-select`) work even before the MCP / `serve` are up.

## What maps 1:1 and what differs

Maps **1:1** from the Claude Code plugin (same technical content):

- **Subagents** — the 4 roles (tia-engineer, hardware-architect, verifier, safety-reviewer) with the
  same role/guardrails/when-to-use. They stay as `agents/<name>.md` with YAML frontmatter (`name`,
  `description`; optional `tools`, `mcpServers`, `model`) and the **body** as the system prompt.
- **Operating guide** — `CLAUDE.md` → `GEMINI.md`, same gates-vs-guards model, GUI-gate handoff
  table, and gotchas.
- The `tia_*` tool names, the gates/guards, the CPU table, and the verified bare-CPU recipe are
  preserved as-is inside the command prompts and auxiliary references.

What **differs** (the key one):

- **Skills become commands, and there is NO auto-trigger.** Gemini CLI has no skill auto-invocation,
  so each of the 8 skills is ported to a **custom command** in `commands/<name>.toml` (keys:
  `description`, `prompt`; `{{args}}` for the spec/input). You **invoke them explicitly** by slash
  command (`/spec-validate`, `/cpu-select`, `/spec-plan`, `/tia-review`, `/tia-scaffold`,
  `/tia-verify`, `/tia-handoff`, `/tia-init`) instead of the model picking a skill from its
  `description`. The "USE when / do NOT use" guidance from each skill's frontmatter is preserved in
  the command `description` and prompt, but it informs **you** when to invoke, not an auto-router.
- Command file names use **hyphens** (`spec-validate.toml`) where Claude skills used dots
  (`spec.validate`); subfolders namespace as `/folder:name` if you nest them.
- Subagents install under **`~/.gemini/agents/`**, commands under **`~/.gemini/commands/`**, and the
  guide is **`GEMINI.md`** — the standard Gemini CLI locations. There is no marketplace install; copy
  the files.
- The `tia` MCP is registered in **`~/.gemini/settings.json`** (`mcpServers`) rather than a plugin
  manifest — see [`../docs/INSTALL.md`](../docs/INSTALL.md).

## Reminder — gates, guards, serial-only

The harness encodes **gates** (human-only: trust dialog G1, download/CPU-STOP G3, go-online G4,
network scan G7, master-secret G6, safety/F G5 — never autonomous) and **guards** (tool-enforced:
compile-clean before deploy, dry-run→approve, idempotency by name, `OrderNumber:<MLFB>/V<fw>`,
**serial-only**). The `serve` backend is a **single serial worker** — never parallelize `tia_*`
calls. See [`GEMINI.md`](GEMINI.md) for the full gates/guards model, the GUI-gate handoff table, and
the gotchas.
