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
.codex-plugin/plugin.json               # Codex plugin manifest (read before .claude-plugin/plugin.json)
codex/
├─ mcp.json                            # the `tia` MCP server the plugin registers
├─ hooks.json                          # empty on purpose: keeps the Claude-only SessionStart hook out of Codex
├─ AGENTS.md                           # operating guide (port of .claude-plugin/CLAUDE.md)
├─ agents/                             # subagents as TOML (name, description, developer_instructions)
│  ├─ tia-engineer.toml               # offline program authoring
│  ├─ hardware-architect.toml         # CPU / modules / network
│  ├─ verifier.toml                   # verification ladder (rungs 0-3)
│  └─ safety-reviewer.toml            # READ-ONLY F review (nothing autonomous)
└─ skills/                             # skills as SKILL.md + auxiliary files
   ├─ spec-validate/  cpu-select/  spec-plan/  tia-review/  tia-scaffold/
   └─ tia-verify/  tia-handoff/  tia-init/  tia-backup/
```

## Which channel carries what

Measured with `codex-cli 0.145.0` against an isolated `CODEX_HOME` (see [Evidence](#evidence)):

| Piece | Channel | Notes |
| --- | --- | --- |
| `tia` MCP server | **plugin** (`codex/mcp.json`) | Same npm package as everywhere else. A hand-made `codex mcp add tia ...` of the same name shows up instead of the plugin's in `codex mcp list` (not proven at runtime). |
| Skills (9) | **plugin** (`codex/skills/`) | Listed to the model as `tia-harness:<skill>`. |
| Subagents (4) | **copy** into `<codex home>\agents\` | Plugins do not carry subagents (the plugin docs do not mention them). |
| Operating guide | **`tia-init`** per project (or the `tia_guide` tool) | Not copied globally, see [The operating guide](#the-operating-guide). |

## Alternative, once published: the guided setup

`npx @renanlido/plcware-setup` connects Codex, and the other agents on the machine, in one run instead of the plugin and
the copy step below. **It is not published yet**, so that command does not work today: use the install below. For Codex it:

- registers the `tia` MCP server in a managed `[mcp_servers.tia]` section of `config.toml`, between `# tia-harness`
  markers, with or without the `codex` command (`startup_timeout_sec = 90`, `tool_timeout_sec = 150`); a connection it made earlier with
  `codex mcp add tia` stays on that route;
- copies the 9 skills (these Codex-wording files) to `~/.agents/skills` and the 4 subagents to `<codex home>/agents`
  itself, **without the plugin**, so the skills are not listed as `tia-harness:<skill>`;
- pre-approves the 62 read-only (class R) tools in that same section (`default_tools_approval_mode = "prompt"` plus
  `approval_mode = "approve"` per read-only tool); every tool that changes the project or touches the PLC still asks;
- records everything, so its `uninstall` removes only what it added. Hand-made skill folders that are exactly a version the
  public repository released are moved aside; a hand-made subagent file of a released version is replaced by the new one
  (the old bytes are kept and `uninstall` puts them back), and an edited subagent file stops Codex's plan. A copy of the
  guide in `~/.codex/AGENTS.md` is left in place, with a note; it writes no guide of its own (the server's operating brief
  and `tia_guide` replace it).

Use one route: it stops for Codex while the plugin is installed (remove it with the Uninstall commands below), and a
`codex mcp add tia` run by hand after it wrote the section makes Codex rewrite that section and drop the pre-approvals.
It was tested only against the real `codex-cli` 0.145.0 in throw-away homes (Codex reads the section as the `tia` server
with the 62 pre-approvals, and uninstall restores `config.toml` byte for byte) and never in a model session, so a read-only
tool was not seen running without a prompt. That Codex validates `approval_mode` (an unknown value makes it refuse the whole
configuration, so `codex mcp get` exiting 0 shows the section was parsed) was seen in a separate spike, recorded in
[the research](../docs/research/2026-10-16-class-r-preapproval.md).

## Install (Windows, PowerShell)

Needs Codex with the `codex plugin` command (0.145.0 tested) and Node.js (the MCP runs through `npx`).

```powershell
# 1. MCP + skills through the plugin marketplace (the marketplace name is tia-openness)
codex plugin marketplace add renanlido/tia-harness
codex plugin add tia-harness@tia-openness

# 2. Subagents: copy from the installed plugin into the Codex home, never overwriting your own files
$h = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$plugin = Get-ChildItem (Join-Path $h "plugins\cache\tia-openness\tia-harness") -Directory |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
New-Item -ItemType Directory -Force (Join-Path $h "agents") | Out-Null
foreach ($f in Get-ChildItem (Join-Path $plugin.FullName "codex\agents\*.toml")) {
  $dst = Join-Path $h "agents\$($f.Name)"
  if (Test-Path $dst) { Write-Warning "skipped $($f.Name): already exists" }
  else { Copy-Item $f.FullName $dst; "copied $($f.Name)" }
}

# 3. Check
codex plugin list
codex mcp list
```

From a local checkout (or any directory laid out like this repo) use its path instead of `renanlido/tia-harness` in
step 1: `codex plugin marketplace add C:\path\to\checkout`.

The MCP talks to the `serve` API at `http://localhost:5000` by default. For a `serve` on another host, two routes, both
**unproven at runtime** (they need a model session): set `TIA_API_BASE` in your user environment (the plugin forwards it, as the
Codex docs describe for `env_vars`), or define the same server yourself, which `codex mcp list` shows in place of the
plugin's entry (the Codex MCP docs say a plugin's server is launched from the plugin and user config does not set its
command, so check `/mcp` that your URL took effect):

```powershell
codex mcp add tia --env TIA_API_BASE=http://<host>:5000 -- npx -y @renanlido/tia-openness-mcp
```

Run `codex` after that and check `/mcp`.
The plugin's MCP entry waits up to 90 s for the first `npx -y` download; `codex mcp add` has no timeout flag and Codex's
default is 10 s, so if the server times out on its first start add `startup_timeout_sec = 90` under
`[mcp_servers.tia]` in `config.toml`, or run `npx -y @renanlido/tia-openness-mcp` once in a terminal to warm the cache.
The plugin's entry also sets `tool_timeout_sec = 150`: Codex gives up on a call after 60 s by default, and catalog and
authoring calls may take 120 s without becoming jobs (a Codex timeout there reports a failure while serve is still
working). It is the documented key of `config.toml`; that the plugin's MCP file honours it is not measured yet. With
`codex mcp add`, add the same line under `[mcp_servers.tia]`.

**Windows launch form.** The plugin and the commands above use `npx` directly, as the Codex docs do. Whether a bare
`npx` (a `.cmd` shim) starts under Codex on Windows could not be proven without a model session (rows CX-03..10 of
[`docs/INSTALL-MATRIX.md`](../docs/INSTALL-MATRIX.md) are `untested`; CX-01/02 only prove registration); a `cmd /c` wrapper is
the workaround others report, but it can itself time out on a cold `npx` (third-party report, not reproduced). This is per client: `docs/INSTALL.md` no longer states `cmd /c` as a general Windows rule. If the server fails to start with a
"program not found" error, switch to `codex mcp add tia -- cmd /c npx -y @renanlido/tia-openness-mcp` from PowerShell or
cmd (Git Bash rewrites `/c` into `C:/`).

## The operating guide

The full guide (gates vs guards, GUI-gate table, gotchas, recipes) is about 61 KB. Codex stops reading instructions at
`project_doc_max_bytes` (32 KiB by default; the AGENTS.md docs describe it for the combined project instructions, and the global file is read first), so it is not
installed globally and never overwrites `~/.codex/AGENTS.md`. Use one of:

- **Ask for it per project:** in a project, tell Codex to run the `tia-init` skill. It writes the Codex-sized guide (about
  27 KB, the `codex` topic of `tia_guide`, on an MCP that offers that topic; on one that does not, the skill falls back to the
  plugin's copy; the recipes stay one `tia_guide` call away) between
  `<!-- tia-harness:start -->` and `<!-- tia-harness:end -->` in that project's `AGENTS.md`, touching nothing outside
  the markers, and re-running only refreshes the block. If the project's own `AGENTS.md` is large, raise the limit
  in `config.toml`: `project_doc_max_bytes = 65536`.
- **On demand:** the `tia_guide` tool of the MCP returns the guide (topics: `codex` for the Codex-sized one, on an MCP that offers it; `gates-guards`, `gui-gates`,
  `gotchas`, `pipeline`, `recipes`, `spec-format`) without writing any file.

## Update

```powershell
codex plugin marketplace upgrade tia-openness     # Git marketplaces only
codex plugin add tia-harness@tia-openness         # refreshes the installed copy (a new version replaces the old folder)
```

Then delete the four subagent files you installed (the uninstall command below) and repeat step 2 (existing files are
skipped, so an edited copy of yours is never replaced silently), and re-run `tia-init` in downstream projects to refresh
the guide block. A marketplace added from a local path is not refreshed by `upgrade`: re-run `codex plugin add` after
changing the directory.

## Uninstall

```powershell
codex mcp remove tia                                    # only if you added it by hand (skip with the plugin alone)
codex plugin remove tia-harness@tia-openness
codex plugin marketplace remove tia-openness
$h = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
Remove-Item (Join-Path $h "agents\tia-engineer.toml"), (Join-Path $h "agents\hardware-architect.toml"), (Join-Path $h "agents\verifier.toml"), (Join-Path $h "agents\safety-reviewer.toml") -ErrorAction SilentlyContinue
```

Left behind, harmless: empty `plugins\cache\tia-openness\` and `agents\` folders (the latter only if the copy step created it), and the guide block that `tia-init` wrote into
any project's `AGENTS.md` (delete the text from `<!-- tia-harness:start -->` to `<!-- tia-harness:end -->` by hand).
Nothing else is written outside the Codex home.

## Without the plugin

The MCP alone: `codex mcp add tia -- npx -y @renanlido/tia-openness-mcp`. Skills alone: copy the folders of
`codex\skills\` into `$HOME\.agents\skills\` (the user-skills location in the Codex docs), skipping names that already
exist. This copy path is **untested** here: Codex still read the real `~/.agents` while `CODEX_HOME` and `USERPROFILE`
pointed elsewhere, so it could not be exercised in isolation. The guided setup (above) makes the same copy; no check that
Codex then lists the skills from there is recorded.

> The MCP is a **pure HTTP client** of the `serve` API (the Windows app that drives TIA Portal). The two pure
> class-R skills (`spec-validate`, `cpu-select`) work even before the MCP / `serve` are up.

## What maps 1:1 and what differs

Maps **1:1** from the Claude Code plugin (same technical content):

- **Subagents** — the 4 roles (tia-engineer, hardware-architect, verifier, safety-reviewer) and
  their role/guardrails/when-to-use. The Markdown frontmatter becomes Codex **TOML** keys: `name`,
  `description`, and `developer_instructions` (the multiline system prompt).
- **Skills** — the 9 skills carry over as `SKILL.md` with YAML frontmatter, plus every auxiliary
  file (`RULES.md`, `RECIPES.md`, `CPU-TABLE.md`, `BASELINE.md`, `examples/`) copied verbatim. The
  gates/guards, the `tia_*` tool names, and the verified bare-CPU recipe are preserved as-is.
- **Operating guide** — `CLAUDE.md` → `AGENTS.md`, same gates-vs-guards model, GUI-gate table, and
  gotchas.

What **differs**:

- Subagents are **TOML** instead of Markdown with frontmatter, and are copied rather than installed by the plugin.
- Codex subagents inherit the parent session's permissions and MCP servers and cannot narrow them
  ([Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)): the read-only limits of
  `safety-reviewer`, `hardware-architect` and `verifier` are instructions in `developer_instructions`, not an enforced
  tool list as in Claude Code.
- The operating guide is **`AGENTS.md`** (per project, written by `tia-init`) instead of `CLAUDE.md`.
- The plugin is described by `.codex-plugin/plugin.json`; the Claude manifest asks for the serve URL through
  `userConfig`, which Codex does not expand, so the Codex manifest registers its own MCP entry.
- The skills in `codex/skills/` differ from the root `skills/` (AGENTS.md instead of CLAUDE.md, Codex vocabulary), which
  is why the Codex manifest points at them.

## Evidence

Everything here was run with `CODEX_HOME` and `USERPROFILE` pointed at a temporary folder and only
plugin/MCP-management subcommands plus `codex debug prompt-input` (renders the model-visible prompt locally, calls no
model), on 2026-10-15 with `codex-cli 0.145.0` on Windows 11 ARM:

- `codex plugin marketplace add <dir>` reads `.claude-plugin/marketplace.json` (marketplace `tia-openness`); `codex plugin add`
  copies the plugin into `<codex home>\plugins\cache\tia-openness\tia-harness\<version>\` and enables it in `config.toml`.
- Without `.codex-plugin/plugin.json` Codex used the Claude manifest and registered `tia` with
  `TIA_API_BASE=${user_config.tia_api_base}` literally; with it, `codex mcp list` shows `npx -y @renanlido/tia-openness-mcp`,
  the forwarded variable and the 90 s timeout. A Codex manifest without `mcpServers` falls back to a root `.mcp.json`.
- `codex debug prompt-input` lists the nine skills as `tia-harness:<name>`, loaded from `codex/skills/` inside the cache.
- A `codex mcp add tia ...` made while the plugin is installed leaves a single `tia` row in `codex mcp list`, with the hand-made command and env. Whether the plugin's server or the hand-made one is the one launched is unproven.
- `codex plugin remove`, `codex mcp remove` and `codex plugin marketplace remove` leave `config.toml` empty and only an empty
  `plugins\cache\tia-openness\` folder.
- Not proven without a model session or the owner's login: that Codex starts the MCP on Windows through bare `npx`, that
  copied subagents are offered to the model, that `<codex home>\agents` follows `CODEX_HOME`, that the empty `hooks.json`
  is what keeps the Claude hook out, and `tia_ping` (needs a running `serve`).

## Reminder — gates, guards, serial-only

The harness encodes **gates** (human-only: trust dialog G1, download/CPU-STOP G3, go-online G4,
network scan G7, credentials G6 (master secret, UMAC, upload / block / certificate passwords,
password policy), safety/F G5 — never autonomous) and **guards** (tool-enforced:
compile-clean before deploy, dry-run→approve, idempotency by name, `OrderNumber:<MLFB>/V<fw>`,
**serial-only**). The `serve` backend is a **single serial worker** — never parallelize `tia_*`
calls. See [`AGENTS.md`](AGENTS.md) for the full gates/guards model, the GUI-gate handoff table, and
the gotchas.
