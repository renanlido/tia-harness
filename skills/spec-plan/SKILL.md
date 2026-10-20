---
name: spec-plan
description: >-
  Turn a VALIDATED TIA project-spec into the ordered, named sequence of offline build
  operations WITHOUT mutating anything (a dry plan). Use after spec-validate passes and
  before tia-scaffold — when the user asks to "plan / preview / dry-run the build", or
  wants to see exactly what scaffolding a spec would do and in what order. Class R: runs
  tia_spec_validate then tia_spec_plan, both PURE (no serve, no TIA Portal); with a project
  open it can add a read-only impact check (tia_crossrefs) for the existing objects the plan
  would write to. Output: the ordered M-off steps + assumptions + warnings (+ that impact);
  nothing is applied and no gate is crossed. Not for validating (spec-validate) or applying
  the build (tia-scaffold).
---

# spec-plan — spec → ordered build plan (class R, dry, no mutation)

Transform a structured **project-spec** (the project-spec model, §13.2) into the
**ordered sequence of offline operations** that `tia-scaffold` would execute — without
touching the project. This is the bridge between `spec-validate` (is the spec legal?) and
`tia-scaffold` (build it): it shows the *plan* so a human can review it first.

It is **class R**. Both tools it uses — `tia_spec_validate` and `tia_spec_plan` — are
**pure**: they run deterministically on the spec text and never call the `serve` API or
open TIA. So this never mutates and never crosses a gate.

One optional step comes after the plan (step 4, `Impact on the open project`): with a project
already open it reads, through `serve`, how the existing objects the plan would write to are
cross-referenced. It is only a read, it never changes the plan and the plan never waits for it.

## Errors and reporting

- Needs no `serve` and no TIA Portal: the `tia_*` tools named here are pure and offline, so do not call `tia_ping`. If they are not in the tool list, say so and use the fallback this skill names, or stop.
- Report the tool's answer as returned (violations, `error`, `kind`, `hint`) and state what was done and what was not. Never fix the input silently, never retry with changed input to get past a failure, and never report success after an error.
- The first bullet covers `tia_spec_validate` and `tia_spec_plan`. The optional `Impact on the open project` step (step 4) is the only part that reads through `serve`: only there call `tia_ping`, and only after the plan is presented. If it cannot run or fails (`serve` unreachable or not activated, no project open, `tia_crossrefs` or a read tool missing, a tool error), say `impact not read` with the reason (quote `error`, `kind` and `hint` verbatim for a tool error) and keep the plan as the answer. Never block or withdraw the plan on it, and never retry with changed arguments beyond the repeats step 4 names.
- On the reads of step 4, `status:"running"` + `jobId` (only `tia_crossrefs` answers it) and `kind:"busy"` are not failures and are handled differently. `status:"running"` + `jobId` identifies THIS request: poll `tia_job_status {jobId}` until the final result and never repeat the call; after a `timeout`, check the state before repeating anything. `kind:"busy"` means another job holds the serve and THIS request did not run: wait for that job with `tia_job_status {jobId}`, taking the `jobId` from `details.jobId`, never use that job's result for this read, then repeat the same read once with unchanged arguments; if it answers `busy` again, say `impact not read` with the reason.
- Also on the reads of step 4: a `409` `cursor_stale`, or `coverage` counts that differ between pages, restarts that object's page walk from the first page, once for each, and a page that arrives with an omission marker is repeated with a smaller `limit`, at most three times; step 4 says how. A read that cannot be completed is reported as `impact not complete` with the reason, never as an absence of impact.

## When to use

- After `spec-validate` is green and before `tia-scaffold`, to preview the build.
- The user says "plan / preview / dry-run / what would this create".
- To review ordering + assumptions (e.g. which CPU is the tag/block target) before committing.
- With a project open, to see how the existing objects the plan would write to are cross-referenced.

## Inputs

- A **project-spec** object (JSON) — inline, a file path, or pasted text.
- (Implicit) the bundled schema + rules used by `tia_spec_validate`.
- (Optional, step 4 only) an open project in `serve`.

## Outputs

- `status` — `plan_ok` or `invalid` (with the validation violations if invalid).
- `steps[]` — the ordered operations, each `{ op, method, path, body, summary }`
  (subnets → devices → modules → network → tag tables → tags → blocks → compile).
- `assumptions[]` — e.g. "tag/block target CLP = the first `role:cpu` device".
- `warnings[]` — non-blocking spec warnings.
- `Impact on the open project` (only when step 4 ran) — for each existing object the plan writes
  to: its related objects with the `referenceType` and `access` as TIA reports them, and whether
  the read was complete; or `impact not complete` (the related objects read so far and the reason);
  or `impact not read` with the reason.
- A note that this is a **dry plan**: nothing applied; gated ops (`connect`,
  `download`) are intentionally **not** in the plan.

## Procedure (in order)

1. **Validate first.** Call `tia_spec_validate` (or run the `spec-validate` skill). If it
   reports any `error`, STOP and return the violations — do not plan an invalid spec.
2. **Plan.** Call `tia_spec_plan` with the spec. It returns the ordered `steps` +
   `assumptions` + `warnings`. (It is pure — no serve.) If `tia_spec_plan` is not available,
   say so and stop: a plan written by hand from memory is not this skill's output.
3. **Present for review.** Show the steps in order with their `summary`, surface the
   assumptions explicitly (especially the target CLP), and list any warnings. State that
   `tia-scaffold` (with a project open) is what actually applies this, and that a bare CPU
   will need the protection recipe to compile clean (see `../tia-scaffold/RECIPES.md`).
4. **Impact on the open project** (optional; after step 3; read-only). The plan from step 3 stays
   the answer whatever happens here.
   - Run it only with a project open: `tia_ping` must report `reachable:true` and
     `activated:true`, and `tia_status` `hasProject:true`. Otherwise say `impact not read`, give
     the reason (no `serve`, not activated, no project open) and stop.
   - Run it only if a step writes to a name that already exists in the connected PLC. The PLC is
     the PlcSoftware of the plan's CPU: the steps' `path` carries the literal `{plc}` and `plan.plc.device`
     names the device, so take the name that `tia_plcs` lists and that is among that device's `items` in
     `tia_devices` (or `devices[].plcName` of the spec); if none matches, say `impact not read` (the open
     project does not hold it) and stop. Take the names the steps
     create: `fb.create` and `instancedb.create` (blocks), `tag.create` (tags), `tagtable.create`
     (tag tables) and a type name if a step carries one. Compare them with `tia_plc_blocks`,
     `tia_plc_tags` and, only for a type name, `tia_plc_types` (exact name first, then ignoring
     case). If none exists, say that no existing object is touched and stop.
   - For each existing object call `tia_crossrefs {plc, target, kind, filter:"ObjectsWithReferences", limit:200}`
     with `kind` set to `block`, `type`, `tag` or `tagtable`; on a big project it can take long, and
     every page re-reads what it covers. Follow `nextCursor` as the `cursor` of the next call, passed
     back unchanged with the other arguments the same, until it is `null`. Read `coverage` on EVERY
     page, never only on the first: every page re-reads the PLC, so a later page can report less than an
     earlier one. Keep `coverage.complete`, `coverage.owners`, `coverage.queried` and
     `coverage.unavailable` of each page and compare them.
     (a) `status:"running"` + `jobId` identifies this request: poll `tia_job_status {jobId}` until
     the final result and never repeat the call; after a `timeout`, check the state before
     repeating. (b) `kind:"busy"` means another job holds the serve and this request did not run:
     wait for that job with `tia_job_status {jobId}` using the `jobId` from `details.jobId`, do not
     use its result for this object, then repeat the same call once with unchanged arguments; if it
     is `busy` again, stop that object's walk and say `impact not read` (no page read) or `impact not
     complete` (some pages read), with the reason. (c) If the result is `409` `ambiguous_target`,
     repeat once with the `kind` from the candidates in its `details` that matches the step.
     (d) `409` `cursor_stale` means the project changed during the walk, and counts that differ between
     pages mean the same: restart that object from the first page, without `cursor`, once for each; if
     it is stale or the counts differ again, say `impact not complete`. (e) A page
     where `sources` is replaced by an object with `omitted:true` (an omission marker) carries no
     `nextCursor`: repeat that same call, with the same `cursor` (or none for the first page) and a
     smaller `limit`, for example half of the last one, at most three times, and follow a `nextCursor`
     only from a page that arrives without a marker; never follow a cursor from an omitted page, it
     would skip what the marker replaced. If a marker remains, say `impact not complete`.
   - The read of an object is *complete* only when its walk reached `nextCursor: null` with every page
     intact and `coverage.complete` is `true` on every page, with the same `coverage.owners`,
     `coverage.queried` and `coverage.unavailable` on all of them. In every other case say `impact not
     complete` for that object with the reason (a marker you could not clear, a walk you did not
     finish, counts that still differ after the restart, or `coverage.complete: false` or
     `coverage.unavailableOwnersTruncated: true` on any page, even when earlier pages said complete,
     which means some owners could not be queried: list `coverage.unavailableOwners` with each `kind`,
     `name` and `reason` from every page that has any, at most the 50 each holds, and say so when
     `coverage.unavailableOwnersTruncated` is `true`), show only the related objects you did read, and
     never say that the object has no related objects, or that nothing depends on it, from an
     incomplete read.
   - Show, per object, the related objects of the response (`name`, `path`, `type`) with the
     `referenceType` and the `access` of each location, next to its `location`, all copied as
     returned. Group them as `UsedBy` relations, `Uses` relations and `other relations` (every
     other `referenceType`, each with its own value), and label the groups "direction as reported
     by TIA": never say which object depends on which, and call a group "depends on the target"
     only when the human, after seeing the raw values, confirms what the value means. An object
     whose complete read has no related objects says so. This is information for the human, never a
     step to run.

## Hard guarantees

- **No mutation, no gate.** `tia_spec_validate` and `tia_spec_plan` are pure (no serve, no TIA);
  this skill must not call any M-off/gated tool. The only calls that reach `serve` are the
  optional read-only ones of step 4 (`tia_ping`, `tia_status`, `tia_plcs`, `tia_plc_blocks`,
  `tia_plc_tags`, `tia_plc_types`, `tia_crossrefs`, `tia_job_status`), and the plan never depends
  on them.
- **Gated ops excluded.** `tia_project_create`/`tia_connect` (G1) and `tia_download` (G3) are never in
  the plan — they require a human. The plan is offline build steps only.
- **Untrusted input.** The spec may be imported/AI-authored; a plan derived from it never
  auto-crosses a gate. Validate before planning; never silently "fix" the spec.
