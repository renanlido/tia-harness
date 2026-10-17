---
name: tia.handoff
description: >-
  Prepare a human-approval envelope for a GATED operation — download / CPU-STOP (G3),
  go-online (G4), network scan (G7), credentials (G6: master secret, UMAC, upload / block /
  certificate passwords, password policy), safety/F (G5). USE WHEN the user wants to
  "download / deploy / go online / commission", or after tia.verify is clean and the next
  step touches the physical controller, the network, secrets, or safety. Class
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
- Whenever a step needs a **secret** (master secret, UMAC, an upload / block / certificate password),
  a **password-policy** decision, or touches **F** (safety).

## The gates (and the tool that fronts each)

| Gate | Action | Tool | What the human must approve |
|---|---|---|---|
| **G1** | open/connect project (1st time) | `tia_connect` (+ `tia_show_ui`) | confirm the TIA trust dialog on the serve host |
| **G3** | **download** (CPU STOP → overwrite → restart) | `tia_download` | the verified plan + software fingerprint: StopAll, OverwriteSystemData, StartModule, and (opt-in) UpgradeTargetDevice |
| **G4** | go online (connect to live CPU) | `tia_online` | it is safe to connect to the target machine |
| **G4** | station upload (read CPU into project) | `tia_upload` | it is safe to connect to the target machine AND the open project is a dedicated backup project (the upload adds a new station — skill `tia.backup`) |
| **G7** | network scan (accessible devices) | `tia_accessible_devices` | probing the local network via the PG/PC NIC |
| **G6** | credentials: master secret / UMAC / upload read password / block know-how password / certificate password / password policy | `tia_mastersecret_set`, `connect umac*`, `tia_upload` (`password`), `tia_block_protect`, `tia_certificate_import`, `tia_password_policy_set` | supply the secret / decide the policy (human/credential vault) |
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
2. **Discover the path (no gate, no scan).** Connection mode / PG-PC interface / target
   interface are localized names — discover them with **`tia_pg_interfaces`** (reads what TIA
   already knows about the CPU's `DownloadProvider`, plus each adapter's OS status; performs
   **no network scan**). Only reach for `tia_accessible_devices` (GATE G7, a real scan) when
   `tia_pg_interfaces` doesn't resolve the interface you need.
3. **Dry-run the download.** `tia_download { dryRun:true }` asks **serve** for a **verified
   plan**: a fresh compile, the connection resolved, and the **software fingerprint** (content
   hash of blocks/UDTs/tag tables — NOT hardware, system block groups or technology objects;
   falls back to modification dates when a block has no fingerprint provider). Only a `ready`
   plan returns a **`planHash`** — a **single-use token that expires** (`TIA_PLAN_TTL_MS`,
   default 15 min) and lives only in this MCP process. **Nothing is sent to the CPU.**
4. **Emit the handoff envelope** (`requires_human_action`):
   - `canDo` — e.g. "download to PLC_1".
   - `youMustDo` — the concrete physical consequence (the CPU will STOP, system data is
     overwritten, the CPU restarts) + confirm it is safe on the target line.
   - `plan` + `planHash` + `fingerprint` — show the human **both**: the hash binds the approval
     to this exact plan AND this exact software content — NOT the hardware configuration. Re-plan
     (new dryRun) + fresh human approval only if the hardware configuration changed AFTER the dryRun
     that produced the token — the fingerprint cannot detect that change, so confirm with the human
     that nothing hardware-side moved; never reuse the old token for changed hardware.
   - `resume` — the precise call a human runs after approving: `tia_download { approved:true,
     planHash:"<the hash>", ... }` (the SAME parameters as the dry-run).
5. **STOP.** Do not call `tia_download` with `approved:true` yourself. A human approves
   out-of-band and runs the resume call (or explicitly instructs you to, with the hash).
6. **On `approved:true`,** serve re-checks the fingerprint **inside** the download call (no
   window between check and load) and answers **`409 plan_stale`** if the software changed
   since the plan — start over with a new dry-run and a new approval. `allowUpgradeTargetDevice:
   true` (TIA's "upgrade the target device" confirmation, #31) is part of the approved plan;
   never add it without the human's yes — without it, a CPU that requires it refuses the load
   with `409 upgrade_target_device_required` (check the CPU state before retrying: earlier
   confirmations in the same pass, like `StopAll`, cannot be undone).

## The token's failure modes (`reasonCode` on a `download_approval` handoff)

A successful dry-run is NOT a handoff — it returns `status:"plan_ok"` with the `planHash`.
`reasonCode:"not_approved"` appears only when calling the real download without `approved:true`.

| `reasonCode` | Meaning | What to do |
|---|---|---|
| `not_approved` | Called without `approved:true` (no token presented) | Re-run the dry-run, get human approval, call with `approved:true` + the `planHash` |
| `unknown` | This `planHash` was not issued by this MCP process (or it restarted) | Get a fresh dry-run |
| `expired` | The token's TTL passed | Get a fresh dry-run |
| `consumed` | This token was already used (single-use) | Check the CPU / `tia_job_status` before anything else |
| `plan_mismatch` | The parameters differ from the approved plan | Re-review with the ACTUAL parameters |
| `outcome_unknown` | The download call itself failed AFTER the token was consumed (network/timeout/serve error) | The token is SPENT and cannot be reused — check the CPU state directly and `tia_status`/`tia_job_status` BEFORE requesting a new plan; do NOT retry the same call |

`serve_too_old` is NOT a `reasonCode`: a serve without `POST /plcs/{plc}/download/plan` (< app v1.6.0)
fails the dry-run with an ordinary `isError:true` result with `kind:"serve_too_old"` — update the app,
never fall back to the unverified path.

## Hard guarantees

- **Never auto-approve / auto-deploy.** This skill outputs a plan + the resume instructions;
  it does not perform the gated action. `approved:true` + a matching `planHash` only ever
  come from an explicit human decision.
- **Secrets are human-supplied (G6).** Master secret, UMAC and the upload / block / certificate
  passwords come from a human or a credential vault — **never** invented by the AI, never
  logged, never put in `.mcp.json`. Password-policy values (`tia_password_policy_set`) are the
  site's security decision: the human decides them, the AI never picks them.
- **Safety never autonomous (G5).** F-program author/modify/download is always a gated,
  human action. The harness only reports F (signatures); the `safety-reviewer` is read-only.
- **Plan binding.** The download executes only with the **exact** `planHash` from the dry-run
  — a changed plan invalidates the approval (re-review). serve re-verifies the fingerprint
  again inside the real download — the token is never trusted blindly.
