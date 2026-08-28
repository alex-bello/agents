# Thin-slice framework

Thin-slice is a planning and delivery framework for turning an idea into a
complete, verifiable outcome through small increments. “Thin” applies to every
work item and commit: each increment should have one primary purpose, a clear
completion boundary, useful observable behavior or an independently testable
seam, and a maintainer-sized review and rollback surface.

The framework preserves the whole product intent before delivery is divided.
It does not mean “build a throwaway prototype” or “make the first issue as
small as possible.” The first increment must still include a real input, the
core behavior, a usable result, and a way to demonstrate it.

## The lifecycle

Use the skills in this order for a new repository and idea:

```text
thin-slice-setup
        ↓
thin-slice-wayfinder (optional conversational discovery)
        ↓
thin-slice (plan; optionally create one tracker)
        ↓
thin-slice (explicitly create selected child work items)
        ↓
thin-slice-implement (one work item per invocation)
        ↓
thin-slice-audit (read-only health check at any time)
```

Wayfinder is the preferred entry point when the idea is underspecified. The
core `thin-slice` skill can also plan a sufficiently clear request directly.
Setup is required before Wayfinder or any configured issue-backed workflow:
it establishes `.thin-slice.yml`, labels, repository scripts, and branch/PR
conventions. Audit is independent and may be run whenever traceability needs
checking.

### 1. Setup: establish the repository foundation

`thin-slice-setup` inspects the repository and provider without changing them.
It reports the current branch, default branch, authentication, labels,
package manager, validation/test/format commands, CI, and capabilities. It
then proposes—only after explicit confirmation—the schema-1 configuration,
required labels, a setup branch, configuration commit, and optional PR.

Setup must not install dependencies, enable CI, modify the default branch, or
create labels without approval. The repository’s canonical validation command
must be `pnpm run validate`. Setup also creates package-script entry points for
source control and configuration validation:

```sh
pnpm run sc -- provider
pnpm run thin-slice:validate-config -- .thin-slice.yml
```

When setup runs from repository-local skill source or installation, those
entries use repository-relative tool paths. When it runs from a global skill
installation, they use absolute paths to that active installation. The setup
resolver fails instead of mixing local and global tools.

### 2. Wayfinder: refine an idea into a specification

`thin-slice-wayfinder` owns the discovery conversation. It asks only questions
that can change behavior, scope, acceptance, risk, architecture, or order;
normally in batches of no more than three. It produces one reviewable
specification containing:

- the outcome, user, and observable value;
- in-scope, out-of-scope, and assumed behavior;
- happy path, alternate paths, errors, permissions, and empty/loading states;
- observable functional and non-functional requirements;
- dependency-ordered feature groups and checkbox tasks;
- manual and automated verification;
- risks, decisions, deferred work, triggers, and the immediate next action.

After review, Wayfinder can create exactly one specification issue. It never
creates child implementation issues. The issue carries a
`thin-slice-wayfinder-spec` metadata block and remains the source specification
from which the implementation plan can be refined into a tracker.

### 3. Planning and tracker management: preserve the source of truth

The core `thin-slice` skill applies the planning principles and supports four
modes:

| Mode | Result | Remote mutation |
| --- | --- | --- |
| Plan | Complete plan and follow-up work | None |
| Initialize tracker | One tracker issue with the complete plan | Create one issue after confirmation |
| Create work items | Child issue for one selected item or group | Create the confirmed batch |
| Record discovery | New work appended to its source group | Add one tracker comment |

A tracker is one issue, not a parent issue plus placeholder issues. Its
markdown checkboxes are the human-facing source of truth. Feature groups are
stable headings with stable slugs. Creating children is always an explicit,
operator-selected action: one exact item creates one child; one group creates
one child for each unchecked item in original order.

Every child must be independently understandable outside the tracker. Its
contract includes objective, context, scope, behavior, acceptance criteria,
verification, non-goals, dependencies, risks/exceptions, and rollback notes.
The child also carries exact provenance linking it back to the tracker, group,
and source item. Invalid or ambiguous selection, missing configuration, or
failed provenance stops creation before mutation.

### 4. Implementation: deliver one issue

`thin-slice-implement` processes exactly one work item. It validates the
configuration and provenance, checks dependencies, checks the worktree, and
only then creates or checks out the deterministic implementation branch. It
implements the smallest complete behavior, runs issue and repository checks,
reviews the diff, and records evidence.

It supports `implement`, `pr`, and `upgrade` modes. Upgrade enriches an
underspecified issue without changing code. In PR mode, the generated body
must preserve the issue’s acceptance-criterion order and show the result of
each required test, acceptance, manual-evidence, and unrelated-change check.
The PR explicitly references the work item with `Closes #<issue-number>` and
links the source tracker.

Discovery-only work is an explicit exception for contracts whose correct output
is documentation rather than application source. Such an issue must declare
`delivery: discovery-only` and name a concrete deliverable: for example, a
capability inventory, workflow map, authorization notes, an application-code
absence record, or actionable follow-up slices. Documentation acceptance is
evaluated separately from code-test acceptance. The implementation records why
source is absent and completes only when the documentation is reviewed and the
next slices are concrete; vague notes or an unspecified deliverable remain
discovery work.

Lifecycle labels describe state, not intent: an issue remains in progress while
its PR is open, and it becomes implemented only after the PR is merged. A
closed, unmerged PR is not success. New work discovered during implementation
is recorded as a provenance-preserving comment on the source tracker rather
than detached into an unrelated issue.

### 5. Audit: verify the chain

`thin-slice-audit` is read-only. It validates configuration, discovers all
matching trackers and work items (including closed records), and checks the
chain:

```text
tracker → implementation issue → branch → commits → pull request
```

It reports each missing, invalid, mismatched, duplicate, or unverifiable
relationship with evidence and one concrete repair action. It distinguishes
“no records found” from “all records are healthy” and never edits issues,
labels, branches, commits, PRs, or configuration.

## Configuration

The setup skill creates `.thin-slice.yml` with schema 1. Validate it from the
repository root after every change:

```sh
pnpm run thin-slice:validate-config -- .thin-slice.yml
```

The validator requires these sections:

```yaml
schema: 1
labels:
  mode: mapped                 # mapped or native
  vocabulary: {}
  mappings: {}
branch:
  pattern: thin-slice/{issue-number}-{short-slug}
implementation:
  create_branch: true
  use_worktree: false
  commit_reference_required: true
  ready_label: thin-slice-ready
  in_progress_label: thin-slice-in-progress
  implemented_label: thin-slice-implemented
  blocked_label: thin-slice-blocked
  needs_discovery_label: thin-slice-needs-discovery
  automatic_lifecycle: false
pull_request:
  creation: ask                 # never, ask, or automatic
  close_work_item_on_merge: false
verification:
  require_tests: true
  require_acceptance_checks: true
  require_manual_evidence_when_relevant: true
  reject_unrelated_changes: false
```

### What the settings change

- `labels.mode` controls label resolution. In `mapped` mode, vocabulary names
  resolve through `labels.mappings`; in `native` mode, the vocabulary names
  are provider labels. Skills never invent or silently substitute labels.
- `branch.pattern` controls implementation branch names. The required tokens
  become the decimal issue number and a lowercase, hyphenated title slug
  limited to 50 characters.
- `implementation.create_branch` controls whether implementation prepares a
  dedicated branch. `implementation.use_worktree` controls whether that
  branch is implemented in a separate Git worktree, defaulting to `false` for
  existing configurations. `commit_reference_required` requires every
  implementation commit after the branch base to mention the selected issue
  number.
- The implementation label fields define the shared state vocabulary:
  ready, in-progress, implemented, blocked, and needs-discovery.
  `automatic_lifecycle` controls whether the skill mutates those labels as it
  moves through implementation.
- `pull_request.creation` controls PR behavior: `never` prepares metadata only,
  `ask` confirms immediately before creation, and `automatic` creates after all
  gates pass. `close_work_item_on_merge` controls whether a merged PR closes
  the implementation issue.
- `verification.require_tests`, `require_acceptance_checks`, and
  `require_manual_evidence_when_relevant` make those evidence categories
  required before PR creation. `reject_unrelated_changes` determines whether
  unrelated diff content is a hard failure.

## Documents and metadata

The lifecycle creates or relies on these artifacts:

| Artifact | Created by | Purpose |
| --- | --- | --- |
| `.thin-slice.yml` | Setup | Repository policy and label/branch/verification settings |
| Specification issue | Wayfinder | Reviewed product and engineering specification |
| Tracker issue | Planning | Complete plan and checkbox source of truth |
| Child work issue | Planning, on selection | One implementation contract and provenance chain |
| Discovery comment | Planning or implementation | New work tied to its original group and item |
| Implementation branch | Implement | Isolated change named from issue and title |
| Implementation worktree | Implement | Optional separate checkout removed after confirmed PR merge |
| Commit(s) | Implement/repository workflow | Verifiable code changes referencing the issue when required |
| Pull request | Implement, if enabled | Review, acceptance evidence, and merge boundary |
| Audit report | Audit | Read-only traceability and repair findings |

Important metadata blocks are machine-readable and should not be casually
edited:

- `thin-slice-wayfinder-spec` / `thin-slice-provenance`: refined
  specification provenance;
- `thin-slice-tracker`: tracker kind and feature-group slugs;
- `thin-slice-work-item`: schema 2 child provenance, including
  `source-tracker`, `feature-group`, `source-item`, and `depends-on`.
  `depends-on` always contains implementation issue numbers; planned
  source-item slugs belong only in the human-readable Dependencies section
  until their child issues exist;
- `thin-slice-discovery`: tracker comment provenance for newly discovered work.

These blocks make the lifecycle auditable. Human-readable fields such as
`Source tracker`, `Feature group`, and `Source item` must agree with the
machine-readable values and the referenced tracker.

## Operating rules

Remote issue, label, comment, and PR operations go through the repository’s
`source-control` skill and `skills/source-control/scripts/sc`. They require
the appropriate confirmation immediately before externally visible mutation.
Never use a provider CLI or raw API as a fallback. If a gate fails, preserve
the draft or worktree, report the exact evidence, and state the single
remediation needed.

The framework favors reversible assumptions, explicit deferred work, complete
acceptance evidence, and traceability over automation for its own sake. When
in doubt, keep the source plan intact, make one increment verifiable, and run
the audit to find what the records can no longer prove.
