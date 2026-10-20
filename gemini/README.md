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

## Install as a Gemini CLI extension (recommended until the guided setup is published)

One command installs the `tia` MCP server, the skills and the operating guide, and Gemini itself
handles updates:

```bash
gemini extensions install https://github.com/renanlido/tia-harness
```

It asks for the **PLCWare API URL** (`TIA_API_BASE`). Press Enter to keep the default
`http://localhost:5000`; use `http://<vm-ip>:5000` when `serve` runs on another machine. Change it
later with `gemini extensions config tia-harness`. Update and remove with
`gemini extensions update tia-harness` and `gemini extensions uninstall tia-harness`.
Check the result inside Gemini with `/mcp` (server `tia`) and `/skills`.

What the extension loads (manifest: [`../gemini-extension.json`](../gemini-extension.json), at the
repo root because Gemini installs an extension from the root):

| Piece | Where it comes from | Notes |
|---|---|---|
| MCP server `tia` | `mcpServers` in the manifest | `npx -y @renanlido/tia-openness-mcp`; env `TIA_API_BASE` defaults to localhost when the setting is empty |
| Skills | root [`../skills/`](../skills) | the same Agent Skills (`SKILL.md`) Claude Code uses; Gemini auto-activates them from their `description` |
| Operating guide | `contextFileName: gemini/GEMINI.md` | loaded into every session |
| Subagents (4) | root [`../agents/*.md`](../agents) | Gemini-format files generated from the Claude ones; see "Subagents" below |
| Commands (`gemini/commands/*.toml`) | **not loaded** by the extension | the skills replace them; see "Migration" below |

### Alternative, once published: the guided setup

`npx @renanlido/plcware-setup` connects Gemini CLI, and the other agents on the machine, in one run, **without the
extension**. It is **not published yet**, so that command does not work today: use the extension above. For Gemini CLI it:

- edits the one `mcpServers.tia` key of `~/.gemini/settings.json` (comments and other settings stay);
- copies the 9 skills to the shared `~/.agents/skills` and the 4 subagents (the root `agents/*.md`, Gemini format) to
  `~/.gemini/agents`;
- pre-approves the 62 read-only (class R) tools with a policy file of its own, `~/.gemini/policies/plcware-tia.toml` (one
  `allow` rule per tool, never `trust: true`, which would allow every tool); tools that change the project or touch the
  PLC still ask;
- records everything, so `uninstall` removes only what it added. Hand-made commands and skill folders that are exactly a
  version the public repository released are moved aside; a hand-made subagent file of a released version is replaced by the
  new one (the old bytes are kept and `uninstall` puts them back), and an edited subagent file stops Gemini's plan. A
  hand-copied `~/.gemini/GEMINI.md` is left in place, with a note. It writes no context file of its own: the server's
  operating brief and `tia_guide` replace it.

It stops for Gemini CLI while the `tia-harness` extension is installed (a second copy would run two servers against one
PLCWare), so pick one. Gemini keeps every MCP server disabled, user-level ones included, in a folder you have not trusted
(observed with 0.64.0): choose "Trust folder" when it asks, or run `/permissions trust`; the setup never trusts a folder
for you. It was tested only against the real `@google/gemini-cli` 0.64.0 in throw-away homes (`gemini skills list` finds
the 9 skills; `gemini mcp list` shows `Disconnected` within its 5 s window, as with the extension) and never in a logged-in
session.

### Subagents: one directory, two formats

Gemini reads extension subagents only from `<extension root>/agents/*.md` (no manifest field, no subdirectories, files starting
with `_` are skipped; Gemini docs, "Extension reference"; subagents are labelled a preview feature) and validates each file with a
strict schema: `tools` must be a YAML **array** of Gemini tool names (built-ins such as `read_file`, `grep_search`, `glob`; MCP
tools as `mcp_<server>_<tool>`, wildcard `mcp_<server>_*`) and any other frontmatter key is rejected. Claude Code names its tools
differently (`Read`, `mcp__plugin_tia-harness_tia__*`), so **no single file is valid for both**, and leaving `tools` out would
give the read-only roles every tool. The repo therefore keeps three copies of the four roles:

| Path | Format | Read by |
|---|---|---|
| [`../agents/claude/*.md`](../agents/claude) | Claude Code (`tools:` comma string, plugin-scoped MCP names) | Claude Code, through the plugin manifest field `agents` in `.claude-plugin/plugin.json`; that field replaces the default `agents/` scan, so the Gemini files in the root are not loaded as Claude agents. **Source of truth.** |
| [`../agents/*.md`](../agents) | Gemini CLI (`tools:` YAML array, `mcp_tia_<tool>` names) | the Gemini extension, or a manual copy into `~/.gemini/agents/`. **Generated:** edit `agents/claude/`, then `cd mcp && npm run sync`; `mcp/test/agents-layout.test.ts` fails on drift and validates the files with a transcription of Gemini's schema |
| [`../codex/agents/*.toml`](../codex/agents) | Codex custom-agent TOML | copied into `<codex home>/agents/` |

The MCP server is named `tia` in the manifest, so its tools are `mcp_tia_tia_status`, `mcp_tia_tia_compile`, and so on. Whether a
Gemini session resolves those names at run time was **not tested** (it needs a login). Gemini skips an unknown name in `tools`
silently (the agent just gets fewer tools), so a first real session should confirm that the four agents can call `tia_guide`.

### Windows and the MCP launcher

The manifest launches `npx` directly, and that works on native Windows (measured 2026-10-15 on `@google/gemini-cli` 0.64.0: `Connected` with `npx` and with `cmd /c npx`;
rows GM-04/05 of [`../docs/INSTALL-MATRIX.md`](../docs/INSTALL-MATRIX.md)). Caveat: `gemini mcp list` waits only 5 s for a server to connect, so on a slow machine a cold `npx`
start shows `Disconnected` there; raise it per server with `"timeout"` (milliseconds) if you want the list to be green. If you ever need to override the server, a server of the same name in `~/.gemini/settings.json` wins over the extension's:

```json
{ "mcpServers": { "tia": { "command": "cmd", "args": ["/c", "npx", "-y", "@renanlido/tia-openness-mcp"],
  "env": { "TIA_API_BASE": "http://localhost:5000" } } } }
```

### Which Gemini product this targets

This targets **`@google/gemini-cli`**, which still runs for paid API-key / Vertex-style access and
for enterprise Code Assist licenses. Since 2026-06-18 Google stopped serving Gemini CLI to free and
Google AI Pro/Ultra consumer accounts and replaced it with the **Antigravity CLI** (`agy`); its
announcement says Gemini CLI extensions carry over as Antigravity plugins (via an import step), and
that skills, hooks and subagents are kept. Nothing here was tested against Antigravity.

### Testing the extension (measured once on a dev VM, see the evidence below)

Never install or link from the private repo root: the installer copies the **whole** tree (including
`keys/` and the license material). Stage the same set the public mirror gets, and use an isolated
Gemini home (`GEMINI_CLI_HOME`, documented in the configuration reference) so `~/.gemini` stays
untouched:

```powershell
$stage = Join-Path $env:TEMP 'tia-harness-stage'
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $stage | Out-Null
foreach ($d in 'skills','agents','schemas','hooks','.claude-plugin','codex','gemini') {
  Copy-Item $d (Join-Path $stage $d) -Recurse        # the dirs of sync-harness-to-public.yml
}
Copy-Item gemini-extension.json $stage                # the root file the workflow copies
$env:GEMINI_CLI_HOME = Join-Path $env:TEMP 'gemini-home-test'
gemini extensions validate $stage
gemini extensions install $stage                      # answer the API URL prompt (Enter = localhost)
gemini extensions list
gemini mcp list                                       # server `tia` (needs serve + the MCP package reachable)
gemini                                                # then /mcp, /skills, and ask it to call tia_ping
```

Evidence (2026-10-15, `@google/gemini-cli` 0.64.0 from an `npm install --prefix`, Windows 11 ARM64, isolated home; full notes in the Gemini section of
[`../docs/INSTALL-MATRIX.md`](../docs/INSTALL-MATRIX.md)): `validate` passes; `install` asks to trust the source folder, then the workspace, then shows the consent screen
(MCP server, context file, hooks warning, 9 skills) and the API URL prompt; a blank URL keeps `http://localhost:5000`; `list` shows the server and 9 skills; the four
subagents loaded with the layout above (zero load errors; with the old Claude-format files at the root Gemini printed `tools: Expected array, received string` for each and skipped them); `update` and `uninstall` work and leave only Gemini's own state (`trustedFolders.json`, `installation_id`,
`extension_integrity.json`, `projects.json`) in the home. `--consent` does not skip the folder-trust question for a local path. A real session (login) was not run.

To test an update, raise `version` in the staged `gemini-extension.json` and run
`gemini extensions update tia-harness` (a local install compares the manifest version). The real
`install https://github.com/renanlido/tia-harness` can only be tested after the public repo is synced;
that repo has no releases, so Gemini falls back to a plain `git clone` of the default branch.

## What's in here

```
gemini/
├─ GEMINI.md                          # operating guide, the extension's context file
└─ commands/                          # the 9 skills as Gemini custom commands (TOML; manual install only)
   ├─ spec-validate.toml  cpu-select.toml  spec-plan.toml  tia-review.toml  tia-scaffold.toml
   └─ tia-verify.toml  tia-handoff.toml  tia-init.toml  tia-backup.toml
```

## Manual install (without the extension)

Use this if you cannot use extensions, or want the Gemini-format subagents and slash commands.
Do **not** combine it with the extension or with the guided setup: both already provide the same entry points.

1. **Subagents** → copy the root `agents/*.md` (the Gemini format, not `agents/claude/`) into `~/.gemini/agents/`:

   ```powershell
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.gemini\agents" | Out-Null
   Get-ChildItem agents\*.md | ForEach-Object { $t = Join-Path "$env:USERPROFILE\.gemini\agents" $_.Name; if (Test-Path $t) { Write-Host "kept the existing $t (delete it to replace it)" } else { Copy-Item $_.FullName $t } }
   ```

2. **Commands** → copy `commands/*.toml` into `~/.gemini/commands/`:

   ```powershell
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.gemini\commands" | Out-Null
   Get-ChildItem gemini\commands\*.toml | ForEach-Object { $t = Join-Path "$env:USERPROFILE\.gemini\commands" $_.Name; if (Test-Path $t) { Write-Host "kept the existing $t (delete it to replace it)" } else { Copy-Item $_.FullName $t } }
   ```

3. **Operating guide** → put `GEMINI.md` where Gemini CLI reads it: globally as `~/.gemini/GEMINI.md`,
   or per-project as `GEMINI.md` at the repo root.

   ```powershell
   $g = "$env:USERPROFILE\.gemini\GEMINI.md"; if (Test-Path $g) { Write-Host "You already have ${g}, so run /tia-init in your project instead" } else { Copy-Item gemini\GEMINI.md $g }
   ```

4. **The `tia` MCP server** → wire it via `~/.gemini/settings.json` (under `mcpServers`). **Single
   source of installation:** see [`../docs/INSTALL.md`](../docs/INSTALL.md) → section **Gemini CLI**
   for the exact `mcpServers` stanza, the `gemini mcp add` CLI form, and the `TIA_API_BASE` value.

> The MCP is a **pure HTTP client** of the `serve` API (the Windows app that drives TIA Portal).
> Point it at the `serve` host via `TIA_API_BASE` (default `http://localhost:5000`). The two pure
> class-R skills (`spec-validate`, `cpu-select`) work even before the MCP / `serve` are up.

## Migration: commands to skills

`gemini/commands/*.toml` were the original port because Gemini had no skills. Gemini CLI now has Agent
Skills (`SKILL.md`), the same format Claude Code and Codex use, so the extension ships the root
`skills/` and **does not load `commands/`** (the extension root has no `commands/`; this directory
lives under `gemini/`). The slash commands `/spec-validate`, `/tia-review`, ... are replaced by
skills the model activates from their `description`, or that you ask for by name. The TOML files are
kept for manual installs; they are not maintained further and can be removed once the extension is
the only supported path.

Known gaps when the shared skills and hooks run under Gemini (the files are shared with Claude Code,
so they were left as they are):

- `tia-init` writes the guide into `./CLAUDE.md` and falls back to a `${CLAUDE_PLUGIN_ROOT}` path.
  Under Gemini it is redundant (the guide is already the extension's context file); do not use it.
- `hooks/hooks.json` (a Claude Code SessionStart nudge) is also read by Gemini (hooks are on by
  default) and uses `${CLAUDE_PLUGIN_ROOT}`, which Gemini does not resolve; expect a failing hook
  warning at session start until the hook is made portable.

## What maps 1:1 and what differs (manual install)

Maps **1:1** from the Claude Code plugin: the 4 subagent roles (`agents/<name>.md`, generated from `agents/claude/<name>.md`, YAML frontmatter,
body = system prompt), the operating guide (`CLAUDE.md` becomes `GEMINI.md`, same gates-vs-guards
model, GUI-gate handoff table and gotchas) and the `tia_*` tool names, gates/guards, CPU table and
verified bare-CPU recipe.

What **differs** in the manual path:

- Skills are ported as **custom commands** (`commands/<name>.toml`, keys `description` and `prompt`,
  `{{args}}`), invoked explicitly by slash command (`/spec-validate`, `/cpu-select`, `/spec-plan`,
  `/tia-review`, `/tia-scaffold`, `/tia-verify`, `/tia-handoff`, `/tia-init`, `/tia-backup`). Command
  file names equal the skill names; subfolders namespace as `/folder:name`. With the extension you get
  the skills instead (activated by the model).
- Subagents install under `~/.gemini/agents/`, commands under `~/.gemini/commands/`, the guide is
  `GEMINI.md`, and the `tia` MCP is registered in `~/.gemini/settings.json` (`mcpServers`).

## Reminder — gates, guards, serial-only

The harness encodes **gates** (human-only: trust dialog G1, download/CPU-STOP G3, go-online G4,
network scan G7, credentials G6 (master secret, UMAC, upload / block / certificate passwords,
password policy), safety/F G5 — never autonomous) and **guards** (tool-enforced:
compile-clean before deploy, dry-run→approve, idempotency by name, `OrderNumber:<MLFB>/V<fw>`,
**serial-only**). The `serve` backend is a **single serial worker** — never parallelize `tia_*`
calls. See [`GEMINI.md`](GEMINI.md) for the full gates/guards model, the GUI-gate handoff table, and
the gotchas.
