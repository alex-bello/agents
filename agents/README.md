# Custom agents

This directory stores reusable custom-agent source files.

Unlike Agent Skills, custom agent manifests do not have one portable format.
Keep each definition in a plainly readable Markdown source file and note its
target runtime. When an application requires JSON, YAML, or a special directory,
add an adapter or installation instructions beside the source.

Use `example-agent.md` as a starting point. Remove placeholder text before using
an agent in an application.

## Portable lifecycle agents

The lifecycle orchestration skill consumes these provider-neutral definitions:

- [`implementation-agent.md`](implementation-agent.md) — implements one issue
  and returns a strict implementation handoff without creating a PR.
- [`review-agent.md`](review-agent.md) — performs one read-only review pass and
  returns a strict review handoff, with one general PR comment when applicable.

Both definitions include machine-readable YAML contracts, closed field sets,
allowed statuses, identifier and list-shape rules, and field-level rejection
diagnostics. Their role-specific mutation boundaries are enforced by the
orchestrator: implementation is local-only, while review permits at most one
structured general PR comment for a matching pass. The handoff fixtures live in
`skills/thin-slice/thin-slice/tests/handoff-schemas.test.mjs`.

## Portable SDLC agents

- [`sdlc-implementation-agent.md`](sdlc-implementation-agent.md) — implements
  one SDLC work item and returns a strict handoff without provider mutations.
- [`sdlc-review-agent.md`](sdlc-review-agent.md) — performs one read-only
  correctness or risk review and returns structured findings to the
  orchestrator.

SDLC reviewers do not post individual comments; the orchestrator aggregates
their results into one comment per PR pass. The SDLC handoff contracts support
feature/work-item provenance, reviewer identity, and batch run recovery.
