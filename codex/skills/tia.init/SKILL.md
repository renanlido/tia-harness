---
name: tia.init
description: >-
  Initialize or update the current project's AGENTS.md with the TIA harness operating guide.
  USE WHEN the user asks to "init / bootstrap / set up the TIA harness", "add the harness
  guidance to AGENTS.md", or "update the TIA harness section / refresh the harness guide in
  this project". Idempotent: injects the guide between stable markers and re-running only
  refreshes that block, never touching the project's own content. Class R (deterministic,
  file-only, NO MCP). DO NOT USE to drive TIA Portal or call any tia_* tool (it opens nothing),
  to build/verify/deploy a project (use tia.scaffold / tia.verify / tia.handoff), or to edit
  project content outside the harness markers.
---

# tia.init — bootstrap the harness guidance into the project AGENTS.md (class R)

Inject (or refresh) the **TIA harness operating guide** into the **current project's**
`./AGENTS.md`, so that future sessions in this repo automatically know how to drive the `tia`
MCP, where the gates/guards are, and the hard-won gotchas. This is **class R**: deterministic,
file-only, uses **NO MCP** and never opens TIA Portal.

## When to use

- The user asks to initialize / bootstrap / set up the TIA harness in this project.
- The user asks to add or **update** the harness guidance in `AGENTS.md` (e.g. after a plugin
  upgrade ships a newer guide).

## Goal

Write the harness guide into `./AGENTS.md` (the project at the **cwd**) inside **idempotent
markers**, so the harness section is self-contained and updatable without disturbing anything
the project authored.

## Procedure (in order)

1. **Read the guide.** Read the harness guide at `codex/AGENTS.md` (the bundled harness guide) —
   this is the exact content to inject. Do **not** paraphrase or trim it; inject it verbatim.
2. **Locate / create the target.** If `./AGENTS.md` does not exist in the current project,
   create it. If it exists, read it.
3. **Inject between idempotent markers.** The guide block is delimited by:

   ```text
   <!-- tia-harness:start -->
   ... the guide from codex/AGENTS.md ...
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
   guide covers (driving the `tia` MCP, gates vs guards, the comm-scenario examples).

## Hard guarantees

- **Idempotent.** Re-running only refreshes the text between `<!-- tia-harness:start -->` and
  `<!-- tia-harness:end -->`. It never appends a second block and never touches project content
  outside the markers.
- **No MCP / no TIA.** This skill only reads the bundled guide and edits a local Markdown file.
- **Non-destructive.** The project's own `AGENTS.md` content is preserved verbatim; the only
  region this skill owns is the marked block.
