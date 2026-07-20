# Install and use the `tia` MCP (any client)

> **Single source.** This is the canonical install guide. The READMEs point here — do not duplicate
> the steps anywhere else (avoids drift). Update **only here**.

The **`tia` MCP** is an **npm** package (`@renanlido/tia-openness-mcp`) — a **thin HTTP client** that talks
to the **`serve` API** (the Windows app that drives TIA Portal). You **install nothing**: the client runs
the package via `npx`. There is only **one** thing to configure: the **`TIA_API_BASE`** variable, pointing
at the `serve`.

```
[ your AI editor/CLI ]  --(MCP/stdio)-->  [ tia MCP (npx) ]  --(HTTP)-->  [ serve (Windows+TIA) ]
```

## Prerequisite (once, on the host with TIA)

Start the `serve` API on the Windows machine that has TIA Portal V21 — via the **tray GUI**
("TIA Openness API" shortcut → "API" tab → "Start API") **or** from the command line:

```powershell
TIAOpenness.exe serve 5000              # local
TIAOpenness.exe serve 5000 --host 0.0.0.0   # accepts connections from another machine (e.g. Mac → VM)
```

- **Same machine** as the AI editor → `TIA_API_BASE=http://localhost:5000`.
- **Editor on another machine** (e.g. a Mac, with the `serve` on a Windows VM) → `TIA_API_BASE=http://<vm-ip>:5000`
  and start the serve with `--host 0.0.0.0` (and open the port in the firewall).

> The MCP **sends no key** — what activates the server is the **license** configured on the host (the GUI's
> "License" tab). Without an activated serve, the MCP can only diagnose connectivity (`tia_ping`).

---

## ⚠️ Windows: use `cmd /c npx`

On **Windows**, several clients launch the process **without a shell**, and `npx` (which is `npx.cmd`) fails with
`spawn npx ENOENT`. Wherever that happens, replace:

```jsonc
"command": "npx", "args": ["-y", "@renanlido/tia-openness-mcp"]
```

with:

```jsonc
"command": "cmd", "args": ["/c", "npx", "-y", "@renanlido/tia-openness-mcp"]
```

On **macOS/Linux** use the simple form (`npx` directly) — do **not** put `cmd /c` there.

---

## Claude Code

**One command** (user scope — applies to all projects):

```bash
claude mcp add --scope user --env TIA_API_BASE=http://localhost:5000 tia -- npx -y @renanlido/tia-openness-mcp
```

Or via **`.mcp.json`** at the project root (project scope, versionable):

```json
{
  "mcpServers": {
    "tia": {
      "command": "npx",
      "args": ["-y", "@renanlido/tia-openness-mcp"],
      "env": { "TIA_API_BASE": "http://localhost:5000" }
    }
  }
}
```

Check: `claude mcp list` (should list `tia`) · in a session, `/mcp`.

## Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → **Edit Config** opens the file):

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tia": {
      "command": "npx",
      "args": ["-y", "@renanlido/tia-openness-mcp"],
      "env": { "TIA_API_BASE": "http://localhost:5000" }
    }
  }
}
```

On **Windows** use the `cmd /c` form (above) — it is the #1 cause of "the server won't start". Restart the app.

## Codex (CLI + IDE extension)

Config in `~/.codex/config.toml` (the IDE extension shares the same file). Note: **env in a
sub-block** `[mcp_servers.tia.env]`.

```toml
[mcp_servers.tia]
command = "npx"
args = ["-y", "@renanlido/tia-openness-mcp"]

[mcp_servers.tia.env]
TIA_API_BASE = "http://localhost:5000"
```

Or via the CLI:

```bash
codex mcp add tia --env TIA_API_BASE=http://localhost:5000 -- npx -y @renanlido/tia-openness-mcp
```

Check in a session with `/mcp`. (On Windows, replace `npx` with `cmd /c npx` in `args`.)

## Gemini CLI

Config in `~/.gemini/settings.json` (user) or `<project>/.gemini/settings.json` (project):

```json
{
  "mcpServers": {
    "tia": {
      "command": "npx",
      "args": ["-y", "@renanlido/tia-openness-mcp"],
      "env": { "TIA_API_BASE": "http://localhost:5000" }
    }
  }
}
```

Or via the CLI (`-s user` = global; default is project):

```bash
gemini mcp add -s user -e TIA_API_BASE=http://localhost:5000 tia npx -y @renanlido/tia-openness-mcp
```

## Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) — same format as Claude (`mcpServers`):

```json
{
  "mcpServers": {
    "tia": {
      "command": "npx",
      "args": ["-y", "@renanlido/tia-openness-mcp"],
      "env": { "TIA_API_BASE": "http://localhost:5000" }
    }
  }
}
```

## VS Code (Copilot / agent mode)

⚠️ **Different from the others:** the root key is **`servers`** (not `mcpServers`) and use **`"type": "stdio"`**.
File `.vscode/mcp.json` (workspace) — or Command Palette → `MCP: Open User Configuration`:

```json
{
  "servers": {
    "tia": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@renanlido/tia-openness-mcp"],
      "env": { "TIA_API_BASE": "http://localhost:5000" }
    }
  }
}
```

Tools only show up in Copilot in **Agent mode**. CLI alternative: `code --add-mcp "{...}"`.

## Windsurf

File `~/.codeium/windsurf/mcp_config.json` (no project scope), `mcpServers` format:

```json
{
  "mcpServers": {
    "tia": {
      "command": "npx",
      "args": ["-y", "@renanlido/tia-openness-mcp"],
      "env": { "TIA_API_BASE": "http://localhost:5000" }
    }
  }
}
```

---

## Differences summary (what bites)

| Client | File | Root key | `type:"stdio"`? | CLI to add |
|---|---|---|---|---|
| Claude Code | `.mcp.json` (project) / `~/.claude.json` (user, via CLI) | `mcpServers` | optional | `claude mcp add … -- npx …` |
| Claude Desktop | `claude_desktop_config.json` (mac `~/Library/Application Support/Claude/`, win `%APPDATA%\Claude\`) | `mcpServers` | optional | — (edit JSON) |
| Codex | `~/.codex/config.toml` | `[mcp_servers.tia]` (TOML) | — | `codex mcp add …` |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` | — | `gemini mcp add …` |
| Cursor | `.cursor/mcp.json` / `~/.cursor/mcp.json` | `mcpServers` | — | — (JSON/UI) |
| **VS Code** | `.vscode/mcp.json` | **`servers`** | **yes** | `code --add-mcp "{…}"` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | — | — (JSON/UI) |

**Golden rules:** (1) on **Windows**, `cmd /c npx`; (2) in **VS Code**, root key `servers` + `type:"stdio"`;
(3) set **`TIA_API_BASE`** pointing at the `serve`; (4) restart the client after editing the file.

## Remote access (another machine → the serve host)

By default the serve listens only on **localhost** (safe, nothing exposed). To reach it from **another machine**
(e.g. the MCP on your **Mac** → the serve on a **Windows VM**), Windows needs an **HTTP.sys reservation**
(`urlacl`) + the **port opened in the firewall** — otherwise binding to `0.0.0.0`/`+` fails with *Access denied*.

**Via the GUI (1 click — recommended):** **"API"** tab → **"Allow remote access…"** button → confirm the
**UAC** prompt (admin) and, optionally, **restrict to the source IP** (e.g. your Mac's IP). Then set
**Host = `0.0.0.0`** and **"Start API"**. *(If you try to start with a remote Host without allowing it first,
the app detects the error and offers to allow it right there.)*

**From the command line** (PowerShell **as administrator**):

```powershell
TIAOpenness.exe setup-remote 5000 --allow 192.168.68.230   # allow ONLY that source IP (recommended)
TIAOpenness.exe setup-remote 5000                          # allow the whole LAN
TIAOpenness.exe setup-remote 5000 --remove                 # undo (back to localhost-only)
```

> **Security:** allowing remote access exposes the serve to the network. The serve still requires an **active
> license**, but it does **not authenticate individual clients** — who can connect is controlled by
> **firewall/VPN**. Prefer **restricting to the source IP**; only open the whole LAN on a trusted network. On
> the Mac, point `TIA_API_BASE=http://<vm-ip>:5000`.

## Diagnostics

The first tool to call is **`tia_ping`**: `reachable:false` → IP/port/firewall/serve down;
`activated:false` → license missing/invalid on the host; both `true` → ready to use.
