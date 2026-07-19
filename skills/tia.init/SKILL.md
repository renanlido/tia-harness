---
name: tia.init
description: >-
  Initialize or update the current project's CLAUDE.md with the TIA harness operating guide.
  Use when the user asks to "init / bootstrap / set up the TIA harness", "add the harness
  guidance to CLAUDE.md", or "update the TIA harness section / refresh the harness guide in
  this project". Idempotent: injects the guide between stable markers and re-running only
  refreshes that block, never touching the project's own content. Class R (deterministic,
  file-only, no serve/TIA — the only MCP call it may make is the pure, offline tia_guide).
---

# tia.init — bootstrap the harness guidance into the project CLAUDE.md (class R)

Inject (or refresh) the **TIA harness operating guide** into the **current project's**
`./CLAUDE.md`, so that future sessions in this repo automatically know how to drive the `tia`
MCP, where the gates/guards are, and the hard-won gotchas. This is **class R**: deterministic,
file-only, never opens TIA Portal and never touches
the serve — the only MCP call it may make is the pure, offline `tia_guide`.

## When to use

- The user asks to initialize / bootstrap / set up the TIA harness in this project.
- The user asks to add or **update** the harness guidance in `CLAUDE.md` (e.g. after a plugin
  upgrade ships a newer guide).

## Goal

Write the harness guide into `./CLAUDE.md` (the project at the **cwd**) inside **idempotent
markers**, so the harness section is self-contained and updatable without disturbing anything
the project authored.

## Procedure (in order)

1. **Read the guide — prefer the MCP, fall back to the plugin file.**

   1. **If the `tia` MCP is available in this session**, call the `tia_guide` tool with
      `{"topic":"full"}` and use the returned markdown as the exact content to inject.
      This is the preferred source: it always matches the INSTALLED MCP version (the
      `tia_*` tools the user actually has), and it is pure/offline — it does NOT need
      the serve running and never opens TIA Portal.
   2. **Fallback (the `tia` MCP is not available):** read the guide at
      **`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/CLAUDE.md`** — a GENERATED copy of the
      same content (source: `mcp/content/` in the harness repo). **Drop the file's first
      line** — the `<!-- GENERATED from mcp/content/ ... -->` comment — before injecting;
      its "run `cd mcp && npm run sync`" instruction is meaningless in a downstream
      project, and dropping it keeps the injected block identical to what
      `tia_guide {"topic":"full"}` returns.

   In either case inject the guide **verbatim** — do not paraphrase or trim it.

   > ⚠️ **The fallback is NOT `${CLAUDE_PLUGIN_ROOT}/CLAUDE.md`.** `${CLAUDE_PLUGIN_ROOT}`
   > is the plugin root (the directory *containing* `.claude-plugin/`), so that path is the
   > **plugin repo's own development guide** — a different document, not meant to ship.
   > Injecting it would dump the repo's internal notes into the user's project.
   >
   > If the MCP is unavailable AND the fallback file is **not found**: **stop and tell the
   > user.** Do **not** fall back to any other `CLAUDE.md`, do **not** search the filesystem
   > for one, and do **not** reconstruct the guide from memory — an approximate guide is
   > worse than none, because the gates and gotchas in it are safety-relevant.
2. **Locate / create the target.** If `./CLAUDE.md` does not exist in the current project,
   create it. If it exists, read it.
3. **Inject between idempotent markers.** The guide block is delimited by:

   ```text
   <!-- tia-harness:start -->
   ... the guide from ${CLAUDE_PLUGIN_ROOT}/.claude-plugin/CLAUDE.md ...
   <!-- tia-harness:end -->
   ```

   - If both markers **already exist** in `./CLAUDE.md`, **replace only the text between them**
     with the current guide. Leave everything outside the markers exactly as-is.
   - If the markers are **absent**, **append** a fresh block (the two markers wrapping the guide)
     to the **end** of `./CLAUDE.md`, separated by a blank line. Do not move or rewrite existing
     content.
   - **Never** duplicate the block, and **never** delete or edit any project content outside the
     markers.
4. **Confirm.** Tell the user whether the block was **created**, **inserted (appended)**, or
   **updated (replaced)**, the path written (`./CLAUDE.md`), and a one-line summary of what the
   guide covers (driving the `tia` MCP, gates vs guards, the GUI-gate handoffs, the
   runtime-validated gotchas and recipes).

## Hard guarantees

- **Idempotent.** Re-running only refreshes the text between `<!-- tia-harness:start -->` and
  `<!-- tia-harness:end -->`. It never appends a second block and never touches project content
  outside the markers.
- **No serve / no TIA.** This skill only reads the guide (via the pure `tia_guide` tool
  or the bundled fallback file) and edits a local Markdown file.
- **Non-destructive.** The project's own `CLAUDE.md` content is preserved verbatim; the only
  region this skill owns is the marked block.
