---
name: tia-init
description: >-
  Initialize or update the current project's AGENTS.md with the TIA harness operating guide.
  USE WHEN the user asks to "init / bootstrap / set up the TIA harness", "add the harness
  guidance to AGENTS.md", or "update the TIA harness section / refresh the harness guide in
  this project". Idempotent: injects the guide between stable markers and re-running only
  refreshes that block, never touching the project's own content. Class R (deterministic,
  file-only, no serve/TIA — may call only the pure tia_guide tool). DO NOT USE to drive TIA Portal or call any tia_* tool (it opens nothing),
  to build/verify/deploy a project (use tia-scaffold / tia-verify / tia-handoff), or to edit
  project content outside the harness markers.
---

# tia-init — bootstrap the harness guidance into the project AGENTS.md (class R)

Inject (or refresh) the **TIA harness operating guide** into the **current project's**
`./AGENTS.md`, so that future sessions in this repo automatically know how to drive the `tia`
MCP, where the gates/guards are, and the hard-won gotchas. This is **class R**: deterministic,
file-only, never opens TIA Portal and never touches the serve — the only MCP call it may make is the pure, offline tia_guide.

## Errors and reporting

- Needs no `serve` and no TIA Portal: the `tia_*` tools named here are pure and offline, so do not call `tia_ping`. If they are not in the tool list, say so and use the fallback this skill names, or stop.
- Report the tool's answer as returned (violations, `error`, `kind`, `hint`) and state what was done and what was not. Never fix the input silently, never retry with changed input to get past a failure, and never report success after an error.

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
      `{"topic":"codex"}` and use the returned markdown. Preferred: always matches the
      INSTALLED MCP version; pure/offline (needs no serve, opens nothing). It is the guide sized for
      Codex, which reads at most 32 KiB of an AGENTS.md and cuts the rest without a word (the recipes
      stay one `tia_guide {"topic":"recipes"}` call away). Never use `{"topic":"full"}` here: it is
      over that limit. If the answer starts with `> Unknown topic` (an older MCP), use the next source.
   2. **`codex/AGENTS.md` inside the installed plugin** — the plugin copy lives under the Codex
      home, in `plugins/cache/tia-openness/tia-harness/<version>/codex/AGENTS.md`. The guide block
      sits between `<!-- tia-harness:start/end -->` markers; inject ONLY the text between the
      markers.
   3. **`~/.codex/AGENTS.md`** — only if the user put the guide there themselves (older installs;
      same markers rule).
   4. **`codex/AGENTS.md`** — only when you are running from a **clone of the harness repo
      itself** (same markers rule).

   > ⚠️ Do **not** read `./AGENTS.md` (the target project's own file) as the source — that is the
   > file this skill **writes to**, and reading it as the guide would re-inject whatever is already
   > there. If none of the sources above exists: **stop and tell the user** to install the harness
   > plugin (`codex plugin add tia-harness@tia-openness`, see the harness `README`). Do **not**
   > reconstruct the guide from memory — the gates and gotchas in it are safety-relevant.
2. **Locate / create the target.** If `./AGENTS.md` does not exist in the current project,
   create it. If it exists, read it.
3. **Inject between idempotent markers.** The guide block is delimited by:

   ```text
   <!-- tia-harness:start -->
   ... the guide read in step 1 ...
   <!-- tia-harness:end -->
   ```

   - If both markers **already exist** in `./AGENTS.md`, **replace only the text between them**
     with the current guide. Leave everything outside the markers exactly as-is.
   - If the markers are **absent**, **append** a fresh block (the two markers wrapping the guide)
     to the **end** of `./AGENTS.md`, separated by a blank line. Do not move or rewrite existing
     content.
   - **Never** duplicate the block, and **never** delete or edit any project content outside the
     markers.
4. **Check the size.** Codex reads at most 32 KiB (32768 bytes) of AGENTS.md text, counting the
   project's own text before the block (and any other AGENTS.md on the way to the working folder),
   and drops the rest without a word. Measure `./AGENTS.md` after writing it. When it is over
   32768 bytes, tell the user plainly that Codex will not read the end of the guide, how many bytes
   over it is, and the two ways out: shorten the project's own text, or raise
   `project_doc_max_bytes` in `~/.codex/config.toml`. Never trim the guide to make it fit.
5. **Confirm.** Tell the user whether the block was **created**, **inserted (appended)**, or
   **updated (replaced)**, the path written (`./AGENTS.md`), its size against the 32 KiB Codex
   reads, and a one-line summary of what the guide covers (driving the `tia` MCP, gates vs guards,
   the GUI-gate handoffs, the runtime-validated gotchas, the build pipeline and the project-spec
   format; the recipes stay one `tia_guide {"topic":"recipes"}` call away).

## Hard guarantees

- **Idempotent.** Re-running only refreshes the text between `<!-- tia-harness:start -->` and
  `<!-- tia-harness:end -->`. It never appends a second block and never touches project content
  outside the markers.
- **No serve / no TIA.** The only MCP call this skill may make is the pure, offline tia_guide; it never opens TIA Portal.
- **Non-destructive.** The project's own `AGENTS.md` content is preserved verbatim; the only
  region this skill owns is the marked block.
