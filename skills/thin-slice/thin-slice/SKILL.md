---
name: thin-slice
description: Fully refine an idea and divide its implementation into the smallest reasonable, human-verifiable work items, optionally managed through a single gh/tea issue tracker. Use when a user wants detailed discovery without losing incremental control.
---

# Thin-slice planning and issue system

Fully refine the idea enough to expose its user value, essential behavior,
constraints, risks, and meaningful follow-up work. Then divide the resulting
implementation into the smallest reasonable, human-verifiable increments and
optionally preserve them in an issue-backed work system. “Thin” applies to
every work item and commit, not only to an initial release slice.

Use the planning mode unless the user explicitly asks to create or update
remote issues. Remote issue creation and comments are externally visible
writes and require confirmation of the exact operation immediately before it
runs.

## Operating modes

Choose one mode from the request:

1. **Plan** — produce the normal thin-slice output without remote changes.
2. **Initialize tracker** — create exactly one tracker issue containing the
   complete plan, with implementation tasks and follow-up work represented as
   markdown lists grouped by feature group.
3. **Create work items** — inspect an existing tracker issue, then create one
   child issue for a selected checklist item or one child issue per item in a
   selected feature group.
4. **Record discovery** — append newly identified work to the source group by
   commenting on the tracker issue. Do not silently rewrite the original plan.

Implementation is handled by the independently callable
`thin-slice-implement` skill. It accepts one explicit issue or one issue found
by the configured ready label, and processes exactly one issue per invocation.

If the user asks to “track this” without specifying a repository or issue,
prepare the tracker body and ask for confirmation before creating it.

## Input

Accept an idea, desired outcome, or rough project description. The request may
be as short as: “I want to make an agent harness from scratch.”

Use information already supplied by the user and repository before asking
questions. Ask only questions whose answers materially change the product
behavior, intended user, mandatory integration, hard constraint, or proof that
it works. If details are unknown, state the assumption and choose the smallest
reversible option.

## Core rules

1. Define the desired value and complete behavior before slicing the work. Do
   not omit meaningful requirements merely because they do not belong in the
   first increment.
2. Include the complete path required for that outcome: input, core behavior,
   usable output, and a way to verify it. Do not propose a disconnected
   prototype, architecture-only work, or a collection of stubs as the first
   deliverable.
3. Treat legal, safety, security, privacy, data-integrity, and user-stated
   hard constraints as real planning inputs. Place each in the increment where
   it becomes necessary and identify dependencies and triggers.
4. Prefer a local, manual, single-user, or mocked boundary when it proves the
   same core value. Do not add scale, automation, configurability, abstraction,
   multi-tenancy, integrations, dashboards, analytics, or production operations
   unless they are necessary to the first user outcome.
5. Make each work item one coherent change that a maintainer can understand,
   review, test, and if necessary revert without reconstructing a large hidden
   context. A work item may span multiple files when they form one behavior;
   split it when the pieces can be independently verified or create different
   conceptual changes.
6. Do not split work merely to increase the issue or commit count. Combine
   tightly coupled changes when separating them would create a misleading,
   unverifiable intermediate state. Prefer a sequence of small, useful
   increments over one large implementation issue.
7. Avoid speculative design. Name only the components, interfaces, and data
   structures required by the behavior currently being implemented, while
   documenting future decisions and unresolved risks separately.

## Workflow

1. Restate the idea as a single outcome in this form:

   `A <specific user> can <complete one action> and observe <valuable result>.`

   If the user or result is unknown, make the narrowest reasonable assumption
   and label it.

2. Identify the essential path. List only the minimum steps from the user’s
   input to the observable result. Remove each item that can be deferred without
   breaking that path.

3. Write a behavior boundary with three short lists:

   - **In scope:** the necessary capabilities and implementation constraints.
   - **Explicitly out of scope:** tempting additions deliberately deferred.
   - **Assumptions:** decisions made because information was absent.

4. Test completeness. Confirm that the slice has all of the following:

   - A clear user or operator.
   - A real input and a visible result.
   - One end-to-end happy path that can be demonstrated.
   - A concrete acceptance check that someone can perform.
   - Safe handling of any material failure mode that would make the demo
     misleading, unsafe, or destructive.

   If any condition is absent, add only what is needed to satisfy it.

5. Produce a complete but readable implementation plan. Group related work
   under stable, human-readable feature-group headings, order items by
   dependency, and make every item a markdown task checkbox (`- [ ] ...`) when
   it may become a work issue. For each item, state the behavior or artifact it
   changes and its human-verifiable acceptance check.

   Apply the smallest-increment test to every item:

   - It has one primary purpose and one clear completion boundary.
   - It produces a useful behavior, observable artifact, or necessary tested
     seam—not only internal motion with no way to verify it.
   - A maintainer can understand the change without reading unrelated future
     work.
   - It is not so small that it would leave a misleading or unverifiable
     intermediate state.

   If an item fails the test, split or combine it and explain the dependency.

6. Convert deferred concerns into follow-up tickets. Each ticket must include:

   - A concise title.
   - Why it matters.
   - The trigger for doing it (for example, “before external users,” “when
     connecting a second provider,” or “after three manual runs”).
   - Dependencies or risk, if applicable.

   Group tickets into **next**, **before broader release**, and **later**. Put
   security, privacy, compliance, reliability, observability, and scalability
   in the appropriate group based on the actual exposure and trigger; do not
   imply that they are unimportant.

7. End with one recommendation for the immediate next action: the smallest
   implementation or validation task that can begin safely.

## Issue-backed workflow

Use the repository's `skills/source-control/scripts/sc` wrapper for all issue
operations. Read its `SKILL.md` and command contract when invoking it; do not
call `gh`, `tea`, a raw API, or a provider connector directly. First inspect
the provider and authenticate status, then read the narrowest required issue
data. Use temporary body files for every create or comment operation.

### Tracker issue

Create one tracker issue only. Its title should identify the outcome and its
body should contain the complete required output plus a machine-readable
metadata block near the end:

```md
<!-- thin-slice-tracker
schema: 1
kind: tracker
feature-groups: [group-slug, another-group-slug]
labels: [thin-slice, thin-slice-tracker]
-->
```

Use a stable slug for each feature-group heading. Keep the markdown checklist
as the human-facing source of truth. Do not create a child issue merely to
represent the tracker or split one checklist item into multiple issues.

### Child work issues

Before creating children, fetch and inspect the tracker issue, resolve the
requested group or exact checkbox unambiguously, and show the proposed issue
titles, labels, and count. A single item produces one issue; a feature group
produces one issue per unchecked item in its original order. Each child body
must preserve the smallest reasonable human-verifiable increment and include
an implementation contract with Objective, Context, Scope, Detailed behavior,
Acceptance criteria, Verification, Non-goals, Dependencies, Risks and
exceptions, and Rollback notes. Do not generate children from subtasks that cannot stand
alone, and do not merge independent behaviors just to reduce the issue count.
It must include:

```md
Source tracker: #123
Feature group: `group-slug`
Source item: `- [ ] ...`

## Verification

- ...

<!-- thin-slice-work-item
schema: 2
kind: work-item
source-tracker: 123
feature-group: group-slug
source-item: item-slug
depends-on: []
-->
```

Apply the configured labels to every child. Default labels are
`thin-slice` and `thin-slice-work-item`; add `thin-slice-group:<group-slug>`
only when that label already exists. Setup may create explicitly approved
labels through `sc label create`; implementation and planning must not create
labels implicitly. If a requested label is absent or the provider rejects it,
stop before creating any child and report the exact remediation.

After successful creation, report every issue URL and number. The tracker
body cannot be edited through the shared `sc` contract, so record the mapping
from source item to child issue in a tracker comment. Do not claim that a
checkbox was updated unless the remote body was actually changed by an
available, explicitly authorized operation.

### Tracker creation contract

When creating a tracker from a refined specification, create exactly one issue
only after explicit confirmation of the exact title, repository, complete
body, and resolved tracker label. The body must contain the complete
specification and its acceptance criteria, not a shortened summary, followed
by normalized provenance metadata:

```md
<!-- thin-slice-provenance
schema: 1
kind: specification
source: thin-slice-wayfinder
status: refined
-->
```

Use `skills/source-control/scripts/sc issue create --body-file` for the single
mutation and verify its normalized issue number and URL. If creation fails,
report the failure, preserve the body, and do not retry via another interface
or create a duplicate.

### New work discovered during implementation

When implementation reveals additional work, keep it attached to the source
feature group. Add it as a comment using this format:

```md
## Discovered work — `group-slug`

- [ ] New smallest verifiable increment
  - Why: ...
  - Trigger/dependency: ...
  - Verification: ...
  - Source item: `item-slug`
```

If the new item is ready for assignment, offer to create a child issue from
that comment using the same confirmation and labels. Preserve provenance to
the current child issue or source item; never detach the discovery into an
unrelated group.

### Label configuration

Treat labels as a repository-level configuration supplied by the user or
inferred from existing issue labels. Prefer this vocabulary:

- `thin-slice` — all issues managed by this system.
- `thin-slice-tracker` — the single source tracker.
- `thin-slice-work-item` — a derived implementation issue.
- `thin-slice-discovery` — a comment-created addition awaiting triage.
- `thin-slice-review` — an issue awaiting human review.
- `thin-slice-ready` — approved and eligible for implementation.
- `thin-slice-in-progress` — currently being implemented or awaiting PR merge.
- `thin-slice-implemented` — its implementation PR has merged.
- `thin-slice-blocked` — implementation cannot safely proceed.
- `thin-slice-needs-discovery` — requirements need clarification or refinement.
- `thin-slice-group:<slug>` — optional group filter, only if pre-created.

Before initialization, list existing issues or otherwise inspect available
labels if the provider exposes them. Ask the user to choose or create missing
labels rather than inventing a provider-specific label-management command.

## Required output

Use this structure, adapting its length to the idea:

```md
## Refined behavior and incremental plan

**Outcome:** A ... can ... and observe ...

### Behavior boundary

- In scope: ...
- Explicitly out of scope: ...
- Assumptions: ...

### Acceptance check

1. ...
2. ...
3. ...

### Implementation tasks

1. ...
2. ...

## Follow-up tickets

### Next

- **[Title]** — Why it matters; trigger; dependency/risk.

### Before broader release

- ...

### Later

- ...

## Start here

...
```

Keep the refinement detailed enough to prevent hidden requirements, but keep
each implementation item small enough that one developer can understand,
implement, verify, and review it without losing control of the codebase. If an
item cannot be described clearly, identify the uncertainty blocking that item
and ask a focused question.

When operating on issues, additionally report the selected mode, repository and
provider, tracker URL (if created), child issue URLs (if created), labels used,
and any items left untracked because labels, authentication, or provider
capabilities were missing.

## Example

For “make an agent harness from scratch,” fully identify the desired operator
experience, transcript behavior, provider concerns, tool execution, retries,
evaluation needs, UI, multi-user access, and deployment risks. Then slice the
implementation so that, for example, adding one local command and displaying
one persisted result is separate from adding a second provider, retries, or a
dashboard. Each item should be independently understandable and verifiable;
the plan should not pretend the deferred concerns do not exist.

## Failure handling

- If the user asks for a comprehensive specification, refine the requested
  behavior comprehensively, then slice its implementation into minimal
  increments. Do not collapse the plan into a first-slice-only answer.
- If an increment cannot meet a legal, safety, security, privacy, or
  data-integrity requirement, make that requirement part of the increment or
  its dependency and say why.
- If a hard requirement makes a thin slice impractical, say so plainly, present
  the smallest compliant alternative, and list the constraint that caused the
  expansion.
- If provider detection or authentication fails, stop before any write and
  report the wrapper's recovery instruction.
- If one child creation fails after earlier children succeeded, report the
  successful mappings and stop; do not retry blindly or create duplicates.
- If a requested group or checkbox matches zero or multiple items, ask the
  user to disambiguate before creating issues.
