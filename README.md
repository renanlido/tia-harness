# tia-harness — Siemens TIA Portal V21 automation (Claude Code plugin)

A Claude Code plugin that drives **Siemens TIA Portal V21** through the **`tia` MCP server**:
it turns a structured engineering spec into a *compliant-by-construction*, *verifiable* TIA
project and **stops at the human gates** for anything that touches the controller. This plugin
is the open client layer; the TIA Openness `serve` / API it talks to is a separate product.

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

## Related

MCP server on npm: **`@renanlido/tia-openness-mcp`** (`npx -y @renanlido/tia-openness-mcp`).

## License

**TBD** — the plugin is intended as an open client layer; a permissive license (MIT or
Apache-2.0) is planned. Until a `LICENSE` file is added, © the author, all rights reserved.
