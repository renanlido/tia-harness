# Instalar e usar o MCP `tia` (qualquer cliente)

> **Fonte única.** Este é o guia canônico de instalação. Os READMEs apontam para cá — não duplique
> os passos em outro lugar (evita _drift_). Atualize **só aqui**.

O **MCP `tia`** é um pacote **npm** (`@renanlido/tia-openness-mcp`) — um **cliente HTTP fino** que fala
com a **API `serve`** (o app Windows que dirige o TIA Portal). Você **não instala nada**: o cliente roda
o pacote via `npx`. Só existe **uma** coisa a configurar: a variável **`TIA_API_BASE`**, apontando para o
`serve`.

```
[ seu editor/CLI com IA ]  --(MCP/stdio)-->  [ tia MCP (npx) ]  --(HTTP)-->  [ serve (Windows+TIA) ]
```

## Pré-requisito (uma vez, no host com TIA)

Suba a API `serve` na máquina Windows que tem o TIA Portal V21 — pela **GUI de bandeja** (atalho
"TIA Openness API" → aba "API" → "Iniciar API") **ou** por linha de comando:

```powershell
TIAOpenness.exe serve 5000              # local
TIAOpenness.exe serve 5000 --host 0.0.0.0   # aceita conexões de outra máquina (ex.: Mac → VM)
```

- **Mesma máquina** que o editor de IA → `TIA_API_BASE=http://localhost:5000`.
- **Editor noutra máquina** (ex.: Mac, com o `serve` numa VM Windows) → `TIA_API_BASE=http://<ip-da-vm>:5000`
  e suba o serve com `--host 0.0.0.0` (e libere a porta no firewall).

> O MCP **não envia chave** — quem ativa o servidor é a **licença** configurada no host (aba "Licença" da
> GUI). Sem o serve ativado, o MCP só consegue diagnosticar conectividade (`tia_ping`).

---

## ⚠️ Windows: use `cmd /c npx`

No **Windows**, vários clientes lançam o processo **sem shell**, e o `npx` (que é `npx.cmd`) falha com
`spawn npx ENOENT`. Onde isso acontecer, troque:

```jsonc
"command": "npx", "args": ["-y", "@renanlido/tia-openness-mcp"]
```

por:

```jsonc
"command": "cmd", "args": ["/c", "npx", "-y", "@renanlido/tia-openness-mcp"]
```

No **macOS/Linux** use a forma simples (`npx` direto) — **não** ponha `cmd /c` lá.

---

## Claude Code

**Um comando** (escopo de usuário — vale pra todos os projetos):

```bash
claude mcp add --scope user --env TIA_API_BASE=http://localhost:5000 tia -- npx -y @renanlido/tia-openness-mcp
```

Ou por **`.mcp.json`** na raiz do projeto (escopo de projeto, versionável):

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

Confira: `claude mcp list` (deve listar `tia`) · numa sessão, `/mcp`.

## Claude Desktop

Edite o `claude_desktop_config.json` (Settings → Developer → **Edit Config** abre o arquivo):

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

No **Windows** use a forma `cmd /c` (acima) — é a causa nº 1 de "servidor não inicia". Reinicie o app.

## Codex (CLI + extensão de IDE)

Config em `~/.codex/config.toml` (a extensão de IDE compartilha o mesmo arquivo). Note: **env num
sub-bloco** `[mcp_servers.tia.env]`.

```toml
[mcp_servers.tia]
command = "npx"
args = ["-y", "@renanlido/tia-openness-mcp"]

[mcp_servers.tia.env]
TIA_API_BASE = "http://localhost:5000"
```

Ou pela CLI:

```bash
codex mcp add tia --env TIA_API_BASE=http://localhost:5000 -- npx -y @renanlido/tia-openness-mcp
```

Confira numa sessão com `/mcp`. (No Windows, troque `npx` por `cmd /c npx` no `args`.)

## Gemini CLI

Config em `~/.gemini/settings.json` (usuário) ou `<projeto>/.gemini/settings.json` (projeto):

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

Ou pela CLI (`-s user` = global; default é projeto):

```bash
gemini mcp add -s user -e TIA_API_BASE=http://localhost:5000 tia npx -y @renanlido/tia-openness-mcp
```

## Cursor

`.cursor/mcp.json` (projeto) ou `~/.cursor/mcp.json` (global) — mesmo formato do Claude (`mcpServers`):

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

⚠️ **Diferente dos outros:** a chave raiz é **`servers`** (não `mcpServers`) e use **`"type": "stdio"`**.
Arquivo `.vscode/mcp.json` (workspace) — ou Command Palette → `MCP: Open User Configuration`:

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

As tools só aparecem no Copilot em **Agent mode**. CLI alternativa: `code --add-mcp "{...}"`.

## Windsurf

Arquivo `~/.codeium/windsurf/mcp_config.json` (sem escopo de projeto), formato `mcpServers`:

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

## Resumo das diferenças (o que pega)

| Cliente | Arquivo | Chave raiz | `type:"stdio"`? | CLI p/ adicionar |
|---|---|---|---|---|
| Claude Code | `.mcp.json` (projeto) / `~/.claude.json` (user, via CLI) | `mcpServers` | opcional | `claude mcp add … -- npx …` |
| Claude Desktop | `claude_desktop_config.json` (mac `~/Library/Application Support/Claude/`, win `%APPDATA%\Claude\`) | `mcpServers` | opcional | — (edita JSON) |
| Codex | `~/.codex/config.toml` | `[mcp_servers.tia]` (TOML) | — | `codex mcp add …` |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` | — | `gemini mcp add …` |
| Cursor | `.cursor/mcp.json` / `~/.cursor/mcp.json` | `mcpServers` | — | — (JSON/UI) |
| **VS Code** | `.vscode/mcp.json` | **`servers`** | **sim** | `code --add-mcp "{…}"` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | — | — (JSON/UI) |

**Regras de ouro:** (1) no **Windows**, `cmd /c npx`; (2) no **VS Code**, chave `servers` + `type:"stdio"`;
(3) defina **`TIA_API_BASE`** apontando pro `serve`; (4) reinicie o cliente após editar o arquivo.

## Acesso remoto (outra máquina → o host do serve)

Por padrão o serve escuta só em **localhost** (seguro, nada exposto). Para alcançá-lo de **outra máquina**
(ex.: o MCP no seu **Mac** → o serve numa **VM Windows**), o Windows precisa de uma **reserva HTTP.sys**
(`urlacl`) + a **porta liberada no firewall** — senão o bind em `0.0.0.0`/`+` falha com *Acesso negado*.

**Pela GUI (1 clique — recomendado):** aba **"API"** → botão **"Permitir acesso remoto…"** → confirme o
**UAC** (admin) e, opcionalmente, **restrinja ao IP de origem** (ex.: o IP do seu Mac). Depois ponha
**Host = `0.0.0.0`** e **"Iniciar API"**. *(Se você tentar iniciar com Host remoto sem liberar, o app
detecta o erro e já oferece liberar.)*

**Por linha de comando** (PowerShell **como administrador**):

```powershell
TIAOpenness.exe setup-remote 5000 --allow 192.168.68.230   # libera SÓ p/ esse IP de origem (recomendado)
TIAOpenness.exe setup-remote 5000                          # libera p/ a LAN toda
TIAOpenness.exe setup-remote 5000 --remove                 # desfaz (volta a só-localhost)
```

> **Segurança:** liberar acesso remoto expõe o serve à rede. O serve continua exigindo **licença ativa**,
> mas **não autentica clientes individuais** — quem pode conectar é controlado por **firewall/VPN**. Prefira
> **restringir ao IP** de origem; só libere a LAN toda em rede confiável. No Mac, aponte
> `TIA_API_BASE=http://<ip-da-vm>:5000`.

## Diagnóstico

A primeira tool a chamar é **`tia_ping`**: `reachable:false` → IP/porta/firewall/serve desligado;
`activated:false` → licença ausente/inválida no host; ambos `true` → pronto pra usar.
