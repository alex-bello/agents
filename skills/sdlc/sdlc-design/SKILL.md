---
name: sdlc-design
version: 1.0.0
description: Turn an approved SDLC requirements record into a code-informed system design, delivery flavor, and linked implementation work-item batch.
---

# SDLC system design

Process exactly one canonical feature issue. Validate setup and provenance
before reading or mutating provider state.

## Design analysis

Read the complete feature issue, linked decisions, repository documentation,
architecture, relevant source, tests, CI, and operational conventions. Ask only
questions that materially change the implementation design. Produce a design
record with:

- system boundaries, data/control flow, interfaces, persistence, security, and
  failure behavior;
- dependency-ordered implementation steps;
- changed behavior and acceptance evidence for every step;
- explicit `depends_on` issue references, including cross-feature references;
- the selected flavor and its exact PR boundaries;
- risks, compatibility constraints, rollback, and deferred work.

Use `thin-slice` for complete narrow vertical outcomes, `stepwise` for one
coherent larger step per PR, and `feature` for one full-feature PR. Never split
one behavior into layer-only tasks unless the item is explicitly marked as an
enabling prerequisite.

## Approval and child generation

Update the managed design sections of the feature issue and append a structured
design decision record. Transition the feature from `sdlc-requirements` to
`sdlc-design` with one verified label mutation. Require explicit approval of
the design, flavor, child titles, boundaries, dependencies, and exact count.

After approval, create the confirmed child issue batch. Each child must include
its complete context, acceptance and verification, non-goals, dependency list,
source feature issue, design item, order, delivery flavor, and this metadata:

```md
<!-- sdlc-record
schema: 1
kind: work-item
feature: 123
design_item: 2
order: 2
flavor: stepwise
depends_on: [118]
status: ready
-->
```

Apply `sdlc`, `sdlc-work-item`, and `ready` to each approved child. Update the
feature record with child links and transition it to its delivery-ready state.
Use managed temporary files and verify every created issue before reporting
success.

## Failure handling

Reject ambiguous design items, missing dependencies, invalid labels, duplicate
children, or failed provider mutations before creating any child. Preserve the
approved requirements and last verified feature state.
