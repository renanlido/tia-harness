---
name: tia.handoff
description: >-
  Prepare a human-approval envelope for a GATED operation — download / CPU-STOP (G3),
  go-online (G4), network scan (G7), master-secret/UMAC (G6), safety/F (G5). USE WHEN the
  user wants to "download / deploy / go online / commission", or after tia.verify is clean
  and the next step touches the physical controller, the network, secrets, or safety. Class
  GATE: this skill NEVER performs the gated action — it produces the plan + planHash + exactly
  what the human must approve, and the precise resume call. DO NOT USE to actually perform the
  download/online/scan (the AI never approves, never invents a secret, never deploys F
  autonomously), to build a project (use tia.scaffold), or to compile/verify (use tia.verify).
---

# tia.handoff — prepare the gate, let a human act (class GATE)

The harness is an **assistant up to the gate, never an autonomous commissioner**. Anything
that touches the physical controller, the network, secrets, or safety **stops here**: this
skill assembles the approval envelope (`requires_human_action`) — *what can be done*, *what
the human must do*, the *plan + hash*, and the *exact resume call* — and then **stops**.

## When to use

- After `tia.verify` is clean and the user wants to **download / deploy / go online / scan / commission**.
- Whenever a step needs a **secret** (master secret / UMAC) or touches **F** (safety).

## The gates (and the tool that fronts each)

| Gate | Action | Tool | What the human must approve |
|---|---|---|---|
| **G1** | open/connect project (1st time) | `tia_connect` (+ `tia_show_ui`) | confirm the TIA trust dialog on the serve host |
| **G3** | **download** (CPU STOP → overwrite → restart) | `tia_download` | the load preview: StopAll, OverwriteSystemData, StartModule |
| **G4** | go online (connect to live CPU) | `tia_online` | it is safe to connect to the target machine |
| **G7** | network scan (accessible devices) | `tia_accessible_devices` | probing the local network via the PG/PC NIC |
| **G6** | master secret / UMAC | `tia_mastersecret_set`, `connect umac*` | supply the secret (human/credential vault) |
| **G5** | safety/F author·modify·download | — | **never autonomous**; F deploy is a human, gated action |

> **Two classes of human interaction.** The table above is **approval gates** — a human *approves an
> action* that touches the controller, network, secrets, or safety. There is a second class:
> **GUI-config gates** — a human *clicks a setting* that TIA does **not** expose via Openness (the OPC UA
> runtime license / server interface, PUT/GET, the first-connect trust dialog). Those surface during
> **scaffold/verify** — e.g. a compile error *"OPC UA license is not sufficient"* is a **gate, not a bug**.
> Don't retry them blindly; the exact GUI steps for each are in the harness guide
> (`codex/AGENTS.md` → **"Human interaction points (GUI gates)"**).

## Procedure (in order)

1. **Precondition (Gd9).** Confirm the latest `tia_compile` is **clean** (`errors:0`) via
   `tia.verify`. Never prepare a download for an inconsistent project.
2. **Discover the path (G7, gated).** Connection mode / PG-PC interface / target interface
   are localized names — discover them with `tia_accessible_devices` (needs `confirm:true`,
   a network scan → itself a gate) or `tia_connections_diagnose`.
3. **Dry-run the download.** `tia_download { dryRun:true }` → returns `plan`, **`planHash`**,
   `loadPreview` (StopAll / Overwrite / StartModule), and the Gd9 note. **Nothing is sent.**
4. **Emit the handoff envelope** (`requires_human_action`):
   - `canDo` — e.g. "download to PLC_1".
   - `youMustDo` — the concrete physical consequence (the CPU will STOP, system data is
     overwritten, the CPU restarts) + confirm it is safe on the target line.
   - `plan` + `planHash` — the exact binding.
   - `resume` — the precise call a human runs after approving: `tia_download { approved:true,
     planHash:"<the hash>", ... }` (the same plan; the hash binds approval to the reviewed plan).
5. **STOP.** Do not call `tia_download` with `approved:true` yourself. A human approves
   out-of-band and runs the resume call (or explicitly instructs you to, with the hash).

## Hard guarantees

- **Never auto-approve / auto-deploy.** This skill outputs a plan + the resume instructions;
  it does not perform the gated action. `approved:true` + a matching `planHash` only ever
  come from an explicit human decision.
- **Secrets are human-supplied (G6).** Master secret / UMAC password come from a human or a
  credential vault — **never** invented by the AI, never logged, never put in `.mcp.json`.
- **Safety never autonomous (G5).** F-program author/modify/download is always a gated,
  human action. The harness only reports F (signatures); the `safety-reviewer` is read-only.
- **Plan binding.** The download executes only with the **exact** `planHash` from the dry-run
  — a changed plan invalidates the approval (re-review).
