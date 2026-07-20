# tia-harness — Siemens TIA Portal V21 automation (Claude Code plugin)

A Claude Code plugin that drives **Siemens TIA Portal V21** through the **`tia` MCP server**:
it turns a structured engineering spec into a *compliant-by-construction*, *verifiable* TIA
project and **stops at the human gates** for anything that touches the controller. This plugin
is the open client layer; the TIA Openness `serve` / API it talks to is a separate product.

## How it fits together

Three pieces, split by what runs where:

- **`tia-harness`** (this plugin, **MIT**) — the **client**: skills + subagents that reason
  about the project and drive the tools, inside Claude Code.
- **`@renanlido/tia-openness-mcp`** (npm, **MIT**) — the **bridge** the plugin auto-registers
  (`npx -y @renanlido/tia-openness-mcp`): a thin MCP→HTTP client, no Openness/net48 itself.
- **TIA Openness `serve` / API** (separate product) — the **engine** on a Windows host with
  TIA Portal V21, activated by a license. Without it, the MCP can only diagnose connectivity.

The plugin and the MCP are open and free; the `serve` is what actually talks to TIA Portal.

## Install

```text
/plugin marketplace add renanlido/tia-harness
/plugin install tia-harness@tia-openness
/reload-plugins
```

That registers the plugin (skills + subagents) **and the bundled `tia` MCP server**, which runs
`npx -y @renanlido/tia-openness-mcp`.

## Requirements

- **Claude Code** (the plugin runtime).
- **Node.js 20+** on PATH (for the `tia` MCP via `npx`).
- For the MCP-backed skills: a reachable **TIA Openness `serve`** host with a valid activation
  license. Point the MCP at it with `TIA_API_BASE` (default `http://localhost:5000`; use the
  host/VM IP if it runs elsewhere). The offline skills `spec.validate` and `cpu.select` need
  none of this.

Optional env overrides (defaults are built into the MCP, so you usually set none):
`TIA_API_TIMEOUT_MS` (15000), `TIA_SLOW_TIMEOUT_MS` (120000), `TIA_CONNECT_TIMEOUT_MS` (30000).

## Skills

| Skill | What it does | Needs the MCP? |
|---|---|---|
| `spec.validate` | validate a project-spec vs the JSON Schema + engineering rules (incl. the G5 safety rule) | no — offline |
| `cpu.select` | recommend an S7-1500 / S7-1200 CPU + order number (MLFB) from requirements | no — offline |
| `spec.plan` | a valid spec → the ordered, dry build plan (nothing applied) | no — pure |
| `tia.review` | audit an open project vs the baseline (optimized access, symbolic, UDT, naming) | read-only |
| `tia.scaffold` | build a project from a spec (devices → network → tags → blocks → compile) | yes |
| `tia.verify` | the verification ladder (compile / consistency / export) | yes |
| `tia.handoff` | prepare the human-approval envelope for the download / online / safety gates | yes (gate) |
| `tia.init` | inject the harness operating guide into the project's `CLAUDE.md` (idempotent markers) | no — file-only |

## Subagents

`tia-engineer` (offline authoring), `hardware-architect` (CPU / modules / network),
`verifier` (verification ladder), `safety-reviewer` (**read-only** functional-safety review).

## How to use

1. Describe the machine/line, or hand the agent a **project-spec** (JSON). Run `spec.validate`
   (and `cpu.select` for the CPU) — both work offline.
2. With a TIA project open via the MCP, `spec.plan` previews the build, `tia.scaffold` builds
   it, `tia.verify` compiles/checks it.
3. To deploy, `tia.handoff` prepares the gated download/online step for **a human** to approve
   — the plugin never downloads, goes online, or authors safety logic on its own.

## Safety posture (gates vs guards)

The harness is an **assistant up to the gate, never an autonomous commissioner**:

- **Gates (human-only):** first-connect trust dialog · download / CPU-STOP · go-online /
  network scan · master-secret / UMAC · **functional safety (F) — never autonomous**.
- **Guards (automatic):** compile-clean before deploy · plan-then-apply (dry-run) · idempotency
  by name · `OrderNumber:<MLFB>/V<fw>` format · serial-only tool calls · untrusted-input
  (a spec never auto-crosses a gate).

## Other AI clients (Codex, Gemini CLI, Cursor, VS Code, …)

The `tia` **MCP** works in any MCP client, not just Claude Code — it's the same `npx` package. The
canonical, copy-paste install of the **MCP** for **Claude Code, Claude Desktop, Codex (CLI/IDE),
Gemini CLI, Cursor, VS Code, and Windsurf** (with the Windows `cmd /c npx` and the VS Code `servers`
gotchas) is in **[docs/INSTALL.md](docs/INSTALL.md)**.

The **harness** (skills + subagents) installs differently per client. Claude Code uses the
marketplace above. **Codex** and **Gemini CLI** have **no plugin marketplace**, so you install the
harness by **copying the ported files** into their config folders. First clone this repo:

```bash
git clone https://github.com/renanlido/tia-harness.git
cd tia-harness
```

### Codex (CLI + IDE)

```bash
mkdir -p ~/.codex/agents ~/.agents/skills
cp    codex/agents/*.toml  ~/.codex/agents/     # subagents
cp -r codex/skills/*       ~/.agents/skills/    # skills
cp    codex/AGENTS.md      ~/.codex/AGENTS.md    # operating guide (or copy to a repo root)
```

Then wire the `tia` MCP in `~/.codex/config.toml` — see **[docs/INSTALL.md](docs/INSTALL.md) →
Codex**. Full detail: **[codex/README.md](codex/README.md)**.

### Gemini CLI

```bash
mkdir -p ~/.gemini/agents ~/.gemini/commands
cp gemini/agents/*.md      ~/.gemini/agents/     # subagents
cp gemini/commands/*.toml  ~/.gemini/commands/   # the 8 skills, as custom commands
cp gemini/GEMINI.md        ~/.gemini/GEMINI.md    # operating guide (or copy to a repo root)
```

Then wire the `tia` MCP in `~/.gemini/settings.json` — see **[docs/INSTALL.md](docs/INSTALL.md) →
Gemini CLI**. Note: Gemini has **no skill auto-trigger**, so you invoke the skills **explicitly** as
slash commands: `/spec-validate`, `/cpu-select`, `/spec-plan`, `/tia-review`, `/tia-scaffold`,
`/tia-verify`, `/tia-handoff`, `/tia-init`. Full detail: **[gemini/README.md](gemini/README.md)**.

> **Windows (PowerShell)** instead of `cp`: use `Copy-Item codex\agents\*.toml
> $env:USERPROFILE\.codex\agents\` (add `-Recurse` for the `skills` folder) — see the per-port
> READMEs for the exact PowerShell commands.

The Claude Code plugin is the reference; its operating guide
([.claude-plugin/CLAUDE.md](.claude-plugin/CLAUDE.md)) is the canonical source the Codex/Gemini guides mirror.

## Related

MCP server on npm: **`@renanlido/tia-openness-mcp`** (`npx -y @renanlido/tia-openness-mcp`).

## License

**MIT** — see [LICENSE](LICENSE). This plugin is the open client layer; the TIA Openness
`serve` / API it talks to is a separate, proprietary product.
