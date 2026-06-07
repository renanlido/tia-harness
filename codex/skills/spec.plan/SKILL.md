---
name: spec.plan
description: >-
  Turn a VALIDATED TIA project-spec into the ordered, named sequence of offline build
  operations WITHOUT mutating anything (a dry plan). USE after spec.validate passes and
  before tia.scaffold — when the user asks to "plan / preview / dry-run the build", or
  wants to see exactly what scaffolding a spec would do and in what order. Output: the
  ordered M-off steps + assumptions + warnings; nothing is applied and no gate is crossed.
  Do NOT use to validate a spec (run spec.validate first), to actually build/apply the
  project (use tia.scaffold), or to audit an open project (use tia.review). Class R: runs
  tia_spec_validate then tia_spec_plan, both PURE (no serve, no TIA Portal).
---

# spec.plan — spec → ordered build plan (class R, dry, no mutation)

Transform a structured **project-spec** (the project-spec model, §13.2) into the
**ordered sequence of offline operations** that `tia.scaffold` would execute — without
touching the project. This is the bridge between `spec.validate` (is the spec legal?) and
`tia.scaffold` (build it): it shows the *plan* so a human can review it first.

It is **class R**. Both tools it uses — `tia_spec_validate` and `tia_spec_plan` — are
**pure**: they run deterministically on the spec text and never call the `serve` API or
open TIA. So this never mutates and never crosses a gate.

## When to use

- After `spec.validate` is green and before `tia.scaffold`, to preview the build.
- The user says "plan / preview / dry-run / what would this create".
- To review ordering + assumptions (e.g. which CPU is the tag/block target) before committing.

## Inputs

- A **project-spec** object (JSON) — inline, a file path, or pasted text.
- (Implicit) the bundled schema + rules used by `tia_spec_validate`.

## Outputs

- `status` — `plan_ok` or `invalid` (with the validation violations if invalid).
- `steps[]` — the ordered operations, each `{ op, method, path, body, summary }`
  (subnets → devices → modules → network → tag tables → tags → blocks → compile).
- `assumptions[]` — e.g. "tag/block target CLP = the first `role:cpu` device".
- `warnings[]` — non-blocking spec warnings.
- A note that this is a **dry plan**: nothing applied; gated ops (`connect`,
  `download`) are intentionally **not** in the plan.

## Procedure (in order)

1. **Validate first.** Call `tia_spec_validate` (or run the `spec.validate` skill). If it
   reports any `error`, STOP and return the violations — do not plan an invalid spec.
2. **Plan.** Call `tia_spec_plan` with the spec. It returns the ordered `steps` +
   `assumptions` + `warnings`. (It is pure — no serve.)
3. **Present for review.** Show the steps in order with their `summary`, surface the
   assumptions explicitly (especially the target CLP), and list any warnings. State that
   `tia.scaffold` (with a project open) is what actually applies this, and that a bare CPU
   will need the protection recipe to compile clean (see `tia.scaffold`/`RECIPES.md`).

## Hard guarantees

- **No serve / no TIA / no mutation.** `tia_spec_validate` and `tia_spec_plan` are pure;
  this skill must not call any M-off/gated tool.
- **Gated ops excluded.** `project.create`/`connect` (G1) and `download` (G3) are never in
  the plan — they require a human. The plan is offline build steps only.
- **Untrusted input.** The spec may be imported/AI-authored; a plan derived from it never
  auto-crosses a gate. Validate before planning; never silently "fix" the spec.
