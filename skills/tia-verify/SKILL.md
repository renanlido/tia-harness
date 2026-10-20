---
name: tia-verify
description: >-
  Run the offline VERIFICATION LADDER on an open TIA project (rung 1 compile, only Error blocks;
  rung 2 consistency + export/COMPARE roundtrip + VCI workspace diff; rung 3 simulation, future) and
  generate the FAT/SAT I/O list (rung 6, read-only). Use when the user asks to "verify / compile /
  check the project builds", "diff the project against a VCI workspace", for the "FAT/SAT I/O list",
  an "IO list" or "which tags sit on which channels", after tia-scaffold or any authoring change, or
  before tia-handoff (a clean compile is the Gd9 precondition for deploy). Class M-off: compiles via
  the tia MCP; repairs the known bare-CPU protection errors (RECIPES) and re-compiles; the I/O list
  only reads. STOPS at deploy (G3 is gated). Not for a style/architecture audit (tia-review) or for
  downloading (tia-handoff).
---

# tia-verify — the verification ladder, rungs 0–3, and the FAT/SAT I/O list, rung 6 (class M-off)

Prove a project "works in practice" offline, the only honest pre-deploy evidence (the style/architecture
audit is `tia-review`). The ladder: **rung 0** static (`spec-validate`), **rung 1** compile + consistency,
**rung 2** project-as-code export + COMPARE (roundtrip proof), **rung 3** simulation (PLCSIM, future). A
**clean compile is the precondition (Gd9)** for export *and* download — so this gate-keeps `tia-handoff`.

**Rung 6** is the FAT/SAT delivery: this skill covers its I/O list (step 6), generated from `tia_io_map`, a
read independent of the compile; the human signs the FAT/SAT record, the skill never does.

## Errors and reporting

- First call `tia_ping`: continue only if it reports `reachable:true` and `activated:true`. `activated:null` with a busy `detail` means a job is still running: poll `tia_job_status` with the `jobId` you hold, or wait and ping again. Otherwise stop, quote its `detail` and `hint` verbatim and say that nothing was changed (prerequisites: `tia_guide {"topic":"gotchas"}`).
- If no `tia_*` tool is available, the `tia` MCP is not connected: say so and stop. Never continue from memory and never work around it with hand-made HTTP calls (they bypass the MCP's gate checks).
- On a tool error (`isError:true`), quote its `error` and `kind` verbatim, relay its `hint`, and state what was done and what was not. Apply only the remedy the hint or this skill names, at most once; otherwise stop and ask.
- Never report success after an error, never retry a refused call with changed arguments, and never cross a human gate: relay a `requires_human_action` answer verbatim and wait for the human.
- `status:"running"` or `kind:"busy"` is not a failure: poll `tia_job_status {jobId}`. After a `timeout`, check the state before repeating anything.
- This skill names these remedies for `tia_io_map` (step 6): a `409` `cursor_stale` answer, or `coverage` that differs between pages (restart the page walk from the first page, once for each); and a page that arrives with an omission marker (repeat that page with a smaller `limit`, at most three times). Every other tool error stops the I/O list as above: report it as NOT complete, or as *not done* when no page was read.
- For the `status:"running"` and `kind:"busy"` answers of `tia_io_map`, step 6 says which job to poll and what to do next; the bullet above applies to every other call.

## Preconditions

- A project **open** (`tia_status` → `hasProject:true`). Connecting is G1 — defer to the human.

## Inputs / tools

- `tia_compile` (per CLP) — returns `{ state, errors, warnings, messages[] (tree), blockChanges,
  verification, nextHints }`; `blockChanges` lists the blocks whose fingerprint changed during the compile.
- `tia_plc_blocks` (`isConsistent` per block), `tia_export_xml` (bulk SimaticML to disk), `tia_export_block`
  (ONE block inline with `sha256`/`normalizedSha256` and the `contentHash` that guards a block write) and
  `tia_block_compare` (**rung 2's real proof**; a raw hash is NOT proof of equality).
- `tia_export_type` — export ONE PLC data type inline with its `contentHash` (the hash reader of a type).
- Protection repair: `tia_obj_service` + `tia_obj_invoke Protect` + `tia_obj_set_attributes`
  (`../tia-scaffold/RECIPES.md`).
- VCI (rung 2, only when a workspace exists or the human asks): `tia_vci_workspaces`, `tia_vci_status` (class R,
  paged), `tia_vci_export`, `tia_vci_import` (M-off, `dryRun` first) and `tia_vci_workspace_create`.
  I/O list (rung 6, class R): `tia_plcs`, `tia_io_map {plc, limit:100}`.
- The long tools (`tia_compile`, the exports, `tia_block_compare`, `tia_vci_status`, `tia_vci_export`,
  `tia_vci_import`, `tia_io_map`) may answer `status:"running"` + `jobId`: poll `tia_job_status {jobId}`
  until the final result — never repeat the original call.

## Outputs

- Per CLP: `compiled` = `clean` | `error`, `errors`, `warnings`, and — if errors — the **leaf** messages
  (the real text; recurse the tree).
- A ladder verdict: which rungs passed (0 static, 1 compile/consistency, 2 export+compare
  roundtrip, and the VCI rung when it ran: complete, or NOT complete and why, with the rows that
  differ by name) and whether deploy (`tia-handoff`) is unblocked.
- When asked for the I/O list: the FAT/SAT I/O list of step 6, one per PLC, *complete* or starting with the
  words NOT complete and why. It is a document, not a passed rung: it neither unblocks nor blocks deploy.

## Procedure (in order)

1. **Confirm open** (`tia_status`).
2. **Rung 1 — compile** each CLP (`tia_compile`). Interpret: **only `State=Error` blocks**;
   warnings never block (Gd8). The tree's intermediate nodes have empty descriptions — **recurse to
   the leaves** for the real error text (never report "3 errors" without it; `located`, when present,
   already holds the leaves with their path). Read `blockChanges`: a block
   regenerated by this compile needs rung 2 below.
3. **Auto-repair the known case.** If the errors are the bare-CPU **protection** signature
   (password / certificate / access level), apply the `RECIPES.md` protection recipe (the variant for
   the CPU family/firmware; the `Protect` password comes from the human, never invented) and
   **re-compile** once. If the same errors remain, stop and report the leaf messages. When you ask for
   the password, tell the human what the recipe changes: **Full access** (S7-1500) or access control
   **disabled** (S7-1200, FW V4.5+), which the CPU keeps after the next download; name the change in the report.
4. **Consistency.** Confirm `isConsistent` (`tia_plc_blocks`); a freshly imported block, or an **instance
   DB whose FB interface changed**, is inconsistent until compiled. A **(software-scope) re-compile**
   (`tia_compile`) **regenerates** the instance DB (`"change":"modified"` in `blockChanges`): re-run it
   and re-check. Only if it still reports inconsistent, delete the instance DB (`tia_block_delete`) and
   recreate it (`tia_instancedb_create`) once — say that its start values are reset — then recompile;
   if still inconsistent, stop and report. Never reach for `UpdateProgram()` (it does not regenerate).
5. **Rung 2 — project-as-code, export + COMPARE (roundtrip proof).** `tia_export_xml` to a
   directory for a bulk git diff. Then, for any block `blockChanges` flagged (or any block you
   need proof for), call `tia_block_compare {plc, block, xml:"<the committed file's content>"}` —
   `verdict:"equal"` is the actual proof the project matches what's versioned; `"different"` names
   the first differing line. `tia_export_block` gives the project's current XML inline.

   **VCI diff and round trip** — when a VCI workspace exists or the human asks for one: the VCI tools
   take **leaf objects only** (PLC blocks, PLC data types, tag tables), never a device, a PLC, a group
   or the library: a container is refused with `vci_not_leaf`. Start with `tia_vci_workspaces`:
   `mappedObjects` above 0 means a baseline exists.

   **An existing workspace is a baseline: its diff is READ-ONLY.** When the workspace has mapped
   objects, walk `tia_vci_status {workspace, limit: 100}` until `nextCursor` is `null` (same `limit`,
   `cursor` unchanged) and classify every row. `equal` is the only verified match. `projectChanged`,
   `workspaceChanged`, `conflict`, `workspaceFileMissing` and `unequal` are differences: report each by
   name (project changed, file changed, both, file missing, side unknown); they are the result, not
   something to repair. `unknown`, `unsupported`
   and `statusFailed` prove nothing, neither equality nor a diff: report them by name, and the diff is
   NOT complete. Never call `tia_vci_export` or `tia_vci_import` just to make a comparison equal:
   `tia_vci_export` over a mapped object REPLACES its workspace file with the project content, and
   `tia_vci_import` replaces the project object with the file, so either call destroys the very
   difference you were asked to report. Refreshing the baseline is an explicit decision of the human:
   name the objects, ask, and only then run `tia_vci_export` with `dryRun:true` first (every object the
   plan lists with `action: "synchronize"` is a file that will be replaced) and then for real.

   **A new workspace or new objects: export, then prove it.** **Never create a workspace and never
   choose a root path without the human**: call `tia_vci_workspace_create` only with the `rootPath` the
   human gave, after `dryRun:true`. Export the objects under review with `tia_vci_export` and
   `dryRun:true` first, read the plan (`action: "export"` creates a new file; an object listed as
   `synchronize` is already mapped, so stop and treat it as the baseline case above), then apply it.
   Prove the export by walking `tia_vci_status` as above: EVERY row of EVERY page must be `equal`.

   **An import overwrites the project object and has no undo.** Run `tia_vci_import` with `dryRun:true`
   first, read `statusBefore` and `overwritesProjectChanges` of each object and say what the import
   would discard, and ask the human before the real call when `overwritesProjectChanges` is `true`. Pass
   `expectedContentHash` per kind, from a fresh read of the project object: for a block the
   `contentHash` of `tia_export_block {plc, block}`, for a type the `contentHash` of `tia_export_type
   {plc, type}`, and for a tag table none (no hash exists for it and the serve refuses one), so rely on
   the dry run and the postcheck. Call an import verified only when every imported object has
   `postcheck.verified:true`. `409` `import_unverified` means the project object WAS already written and
   `409` `vci_batch_incomplete` means the objects in `done` WERE written: report what was written, never
   "nothing changed". A `504` `worker_restarted`, a `timeout` or a lost session during a VCI write leaves
   the outcome UNKNOWN or partial: read `tia_vci_status` before repeating anything.

   Read `coverage` on EVERY page, never only on the first: every page compares its own rows, so a
   later page can report less than an earlier one. A page with `coverage.complete: false`, any `unknown`,
   `unsupported` or `statusFailed` row, an omission marker that remains after three repeats with a
   smaller `limit`, a walk that did not finish, or a `total` that differs between pages makes the VCI
   rung NOT complete: say which, and do not claim the workspace is in sync. A `total` that differs
   between pages means the workspace changed during the walk, so restart it once from the first page,
   without `cursor`, like `cursor_stale`; if it differs again, treat the rung as not complete.
   `status:"running"` + `jobId` identifies this request: poll `tia_job_status {jobId}` until the final
   result and never repeat the call. `kind:"busy"` means another job holds the serve and this request
   did not run: wait for that job with `tia_job_status` using the `jobId` from `details.jobId`, discard
   its result for this request, then repeat the same call once with unchanged arguments; if it is
   `busy` again, stop the walk and treat the rung as not complete. A page where `objects` is replaced
   by an object with `omitted:true` (an omission marker) was too large and has no `nextCursor`: repeat
   that same call with a smaller `limit`, at most three times; never follow a cursor from an omitted
   page, it would skip what the marker replaced.

   Rung 3 (PLCSIM) is **future** — note it, don't fake it.
6. **Rung 6 — FAT/SAT I/O list** (read-only: the I/O map is class R, so this step changes nothing and the skill
   stays M-off). Do it when the user asks for the I/O list, for the FAT/SAT delivery or for which tags sit on which
   channels. It is **independent of the compile**: the map is a read of the hardware and the tags, so it needs no
   rung 1 and no `errors:0`, and when the user asks only for the list you do step 1 and this step and skip the
   compile. The skill produces the list; the human signs the FAT/SAT record, the skill never does.
   - **One list per PLC.** `tia_io_map` takes ONE `plc` per call: for several CPUs loop over `tia_plcs` and make one
     list per PLC, each from its own page walk.
   - **Page the map.** `tia_io_map {plc, limit:100}` for the first page, then the same call with `cursor` set to the
     `nextCursor` of the page just read, passed back unchanged, until `nextCursor` is `null`. Keep `plc` and `limit`
     identical on every page. Every page re-walks the whole PLC, so every page can take minutes on a big project:
     paging bounds the size of a response, not the time of the walk.
   - **Read `coverage` on EVERY page**, never only on the first: every page re-walks the PLC, so a later page can
     report less than an earlier one. Keep the `coverage` of each page (`complete`, `unreadable`, `channels`,
     `channelsUnmapped`, `tagsWithIoAddress`) and compare them: coverage that differs between pages means the project
     changed during the walk, so restart it once from the first page, without `cursor`, like `cursor_stale`; if it
     still differs, the list is NOT complete.
   - **Answers that are not failures and differ.** (a) `status:"running"` + `jobId` identifies this request: poll
     `tia_job_status {jobId}` until the final result and never repeat the call; after a `timeout`, check the state
     (`tia_status`) before repeating. (b) `kind:"busy"` means another job holds the serve and this request did not
     run: wait for that job with `tia_job_status` using the `jobId` from `details.jobId`, do not use its result for
     this list, then repeat the same call once with unchanged arguments; if it is `busy` again, stop the walk and
     treat the list as NOT complete (or *not done* when no page was read). (c) `409` `cursor_stale` means the project
     changed during the walk: restart from the first page, without `cursor`, once; if it is stale again, stop the
     walk and treat the list as NOT complete. (d) A page with an omission marker (`omitted:true`, usually in place of
     `entries`) was too large and carries no `nextCursor`: repeat that same call, with the same `cursor` (or none for
     the first page) and a smaller `limit`, for example half of the last one, at most three times, and follow a
     `nextCursor` only from a page that arrives without a marker; never follow a cursor from an omitted page, it
     would skip what the marker replaced. If a marker remains after three repeats, stop the walk and treat the list
     as NOT complete.
   - **Rows of the table.** One row per item of `tags[]` of every `channel` entry and of every `range` entry with
     status `matched`; one row with an empty Tag cell for a `channel` entry with status `unmatched` and for a
     channelless `range` entry (`channels:0`) with status `unmatched`; one row per `kind:"tag"` entry with
     `status:"unmatched"`, whose Device / module / channel cell stays empty. A `range` entry with status `channels`
     is no row at all: its channels are entries of their own. A `range` entry with status `unresolved` is no row
     either: it goes in 'Could not be mapped', with its tags. A tag that sits on several `channel` entries (a match
     that spans channels) is ONE row, identified by its `table` and `name`, that lists all those channels in its
     Device / module / channel cell. The columns are, exactly: Tag | Address | Data type | Device / module /
     channel | Comment | Status. The Status is `matched`, `unmatched` or `conflict`, copied from the entry and never
     recomputed; a `conflict` row names the `flags` of its entry (`multipleTags`, `spansChannels`, `partial`).
   - **Could not be mapped.** Entries with `status:"unresolved"` (a `channel`, or a `range` with its `tags`) and
     `kind:"tag"` entries with `status:"unparsed"` are NOT rows of that table: they go in a separate list, 'Could not
     be mapped', one item per entry: for a `channel`, its `device`, `path`, `channel` number and its `unresolved`
     text; for a `range`, its `device`, `path`, `ioType`, `from` to `to` and the tags listed in its `tags`, with the
     words 'its channels are unresolved, see their reasons'; for a `tag`, its `table`, `name` and its `reason` text.
   - **Under the table, always:** the coverage numbers `channels`, `channelsUnmapped` and `tagsWithIoAddress` (those
     of the last page read; on a complete walk they are the same on every page), `coverage.limits` verbatim, and the
     sentence that the channel addresses are DERIVED (`addressBasis`: computed from the address range of the item and
     the channel number, never read from TIA) and must be spot-checked against the TIA hardware editor before the
     list is used for FAT/SAT.
   - **Completeness.** The list is *complete* only when the page walk reached `nextCursor: null` with every page
     intact and `coverage.complete: true` on every page. In every other case the report starts with the words NOT
     complete and says why: an omission marker you could not clear, a walk you did not finish (`busy` again, a
     `timeout`, a second `cursor_stale`, coverage that still differs), `coverage.complete: false` on any page, any
     `coverage.unreadable` entry, any unresolved channel or range, any unparsed tag. Then list the
     `coverage.unreadable` entries of every page (`kind`, `device`, `name`, `reason`; say so when
     `unreadableTruncated` is true) and claim nothing about channels or tags that were not read.
     `coverage.limits` is not a reason for NOT complete by itself, but it is always printed.
   - **Never guess.** An unmatched tag is never declared 'unused' or 'orphan': it may sit on a PROFIBUS DP device or
     on a device outside the PLC's PROFINET IO systems, which `coverage.limits` says are not read. Never invent,
     round or 'fix' an address, and never edit tags or hardware to make rows match: this step is read-only, and any
     change goes to `tia-scaffold`.
7. **Report + hand off.** If `errors:0` AND rung 2's comparisons are `equal` (or explicitly
   pending human commit), state that **Gd9 is satisfied** → `tia-handoff` may prepare the
   (gated) download. A VCI rung that is NOT complete is reported as such and never counted as
   proof. If errors remain, list the leaf messages + fixes; do NOT proceed to deploy. If the
   I/O list was asked for, give it with its completeness: it does not change the Gd9 verdict.

## Hard guarantees

- **Compile-clean gate-keeps deploy (Gd9).** Never let `tia-handoff`/download proceed with any `Error`;
  warnings are allowed (report them). Real errors live in the leaf `messages`: summarizing only the count is
  a failure of this skill.
- **M-off only.** Compile/export/protection-repair are offline; the I/O list is a read. Download/online (G3/G4)
  are gated and live in `tia-handoff`.
- **Safety.** Never modify F-logic to "make it compile" (G5); report and defer to the human.
- **VCI is leaf-only, read-only on a baseline and human-rooted.** Pass nothing but PLC blocks, PLC data
  types and tag tables to the VCI tools, never export or import over an existing workspace just to make
  a diff come out equal (refreshing the baseline is the human's decision), create no workspace and choose
  no root path without the human, and never report an import as verified without `postcheck.verified:true`.
- **The I/O list is derived, read-only, never guessed and states its completeness.** The addresses are DERIVED:
  say so and ask for the spot-check in the TIA hardware editor; invent, round or fix no address and edit no tag
  or hardware to make rows match; the human signs the FAT/SAT record. A walk that did not finish, a page that
  kept an omission marker, `coverage.complete: false` on any page or coverage that differs between pages makes
  the list NOT complete: it says why and claims nothing about what was not read. An unmatched tag is never
  called unused or an orphan.
