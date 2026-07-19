---
name: tia.init
description: >-
  Initialize or update the current project's AGENTS.md with the TIA harness operating guide.
  USE WHEN the user asks to "init / bootstrap / set up the TIA harness", "add the harness
  guidance to AGENTS.md", or "update the TIA harness section / refresh the harness guide in
  this project". Idempotent: injects the guide between stable markers and re-running only
  refreshes that block, never touching the project's own content. Class R (deterministic,
  file-only, no serve/TIA — may call only the pure tia_guide tool). DO NOT USE to drive TIA Portal or call any tia_* tool (it opens nothing),
  to build/verify/deploy a project (use tia.scaffold / tia.verify / tia.handoff), or to edit
  project content outside the harness markers.
---

# tia.init — bootstrap the harness guidance into the project AGENTS.md (class R)

Inject (or refresh) the **TIA harness operating guide** into the **current project's**
`./AGENTS.md`, so that future sessions in this repo automatically know how to drive the `tia`
MCP, where the gates/guards are, and the hard-won gotchas. This is **class R**: deterministic,
file-only, never opens TIA Portal and never touches the serve — the only MCP call it may make is the pure, offline tia_guide.

## When to use

- The user asks to initialize / bootstrap / set up the TIA harness in this project.
- The user asks to add or **update** the harness guidance in `AGENTS.md` (e.g. after a plugin
  upgrade ships a newer guide).

## Goal

Write the harness guide into `./AGENTS.md` (the project at the **cwd**) inside **idempotent
markers**, so the harness section is self-contained and updatable without disturbing anything
the project authored.

## Procedure (in order)

1. **Read the guide.** Read the harness guide from the **first** of these that exists — this is the
   exact content to inject. Do **not** paraphrase or trim it; inject it verbatim.

   1. **The `tia` MCP, if available in this session:** call the `tia_guide` tool with
      `{"topic":"full"}` and use the returned markdown. Preferred: always matches the
      INSTALLED MCP version; pure/offline (needs no serve, opens nothing).
   2. **`~/.codex/AGENTS.md`** — where the harness install step puts it (see the harness
      `README`). The guide block sits between `<!-- tia-harness:start/end -->` markers;
      inject ONLY the text between the markers.
   3. **`codex/AGENTS.md`** — only when you are running from a **clone of the harness repo
      itself** (same markers rule).

   > ⚠️ Do **not** read `./AGENTS.md` (the target project's own file) as the source — that is the
   > file this skill **writes to**, and reading it as the guide would re-inject whatever is already
   > there. If neither path above exists: **stop and tell the user** to install the guide
   > (`Copy-Item codex\AGENTS.md $env:USERPROFILE\.codex\AGENTS.md`). Do **not** reconstruct the
   > guide from memory — the gates and gotchas in it are safety-relevant.
2. **Locate / create the target.** If `./AGENTS.md` does not exist in the current project,
   create it. If it exists, read it.
3. **Inject between idempotent markers.** The guide block is delimited by:

   ```text
   <!-- tia-harness:start -->
   ... the guide read in step 1 (~/.codex/AGENTS.md) ...
   <!-- tia-harness:end -->
   ```

   - If both markers **already exist** in `./AGENTS.md`, **replace only the text between them**
     with the current guide. Leave everything outside the markers exactly as-is.
   - If the markers are **absent**, **append** a fresh block (the two markers wrapping the guide)
     to the **end** of `./AGENTS.md`, separated by a blank line. Do not move or rewrite existing
     content.
   - **Never** duplicate the block, and **never** delete or edit any project content outside the
     markers.
4. **Confirm.** Tell the user whether the block was **created**, **inserted (appended)**, or
   **updated (replaced)**, the path written (`./AGENTS.md`), and a one-line summary of what the
   guide covers (driving the `tia` MCP, gates vs guards, the GUI-gate handoffs, the
   runtime-validated gotchas and recipes).

## Hard guarantees

- **Idempotent.** Re-running only refreshes the text between `<!-- tia-harness:start -->` and
  `<!-- tia-harness:end -->`. It never appends a second block and never touches project content
  outside the markers.
- **No serve / no TIA.** The only MCP call this skill may make is the pure, offline tia_guide; it never opens TIA Portal.
- **Non-destructive.** The project's own `AGENTS.md` content is preserved verbatim; the only
  region this skill owns is the marked block.
