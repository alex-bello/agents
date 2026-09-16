---
name: sdlc
version: 1.0.0
description: Apply the unified SDLC workflow, record model, delivery flavors, generic lifecycle states, and shared safety gates.
---

# Unified SDLC

Use this skill as the shared contract for the SDLC skill family. It replaces
thin-slice as the new-work system while preserving thin-slice records through
compatibility readers.

## Required setup

Read `AGENTS.md`, `README.md`, `SDLC.md` when present, and `.sdlc.yml`. Validate
from the repository root with:

```sh
pnpm run sdlc:validate-config -- .sdlc.yml
```

Do not proceed when configuration is missing, invalid, or has ambiguous label
mappings. Use `sdlc-setup` to establish the repository contract.

## Delivery flavors

- `thin-slice`: one smallest practical, demonstrable vertical behavior per
  child issue and PR. Layer-only work requires an explicit enabling reason.
- `stepwise`: one coherent design step per child issue and PR. The step may
  span multiple technical layers, but must have a complete acceptance path.
- `feature`: one child issue and PR for the full approved feature.

The flavor changes decomposition and PR boundaries only. Every flavor requires
observable acceptance, relevant tests, manual evidence when applicable, scope
review, and rollback-aware verification.

## Labels and record invariants

Canonical labels are:

- `sdlc`, `sdlc-feature`, `sdlc-work-item`;
- `sdlc-requirements`, `sdlc-design`;
- `ready`, `in-progress`, `review`, `complete`, `blocked`,
  `needs-discovery`.

Every managed issue has `sdlc`, exactly one type label, at most one phase/state
label, and one valid metadata block. Generic state labels are never sufficient
for automation: filter on `sdlc`, then locally verify type, state, provenance,
and dependencies because provider label filtering differs.

## Canonical feature record

The feature issue is the durable source of truth. Its managed body contains the
current outcome, scope, requirements, system design, chosen flavor, child issue
links, acceptance and verification strategy, risks, follow-up work, and
reconciliation checklist. Append structured decision and transition records;
never silently overwrite approval history.

Use one strict feature metadata block with `schema: 1`, `kind: feature`,
`phase`, `status`, `flavor`, `children`, `dependencies`, `run_id`, and
per-child orchestration records. A child uses `kind: work-item` and records its
feature issue, source design item, order, flavor, explicit `depends_on` issue
numbers, and delivery boundary.

## Shared safety gates

Validate setup, provenance, dependencies, worktree safety, and lifecycle state
before branching or provider mutation. Require explicit approval for planning,
requirements, and system design. Never merge automatically. Preserve the last
verified provider state after any failure and make every external mutation
provider-neutral, inspectable, and idempotent where possible.

Cross-feature dependencies are allowed only through explicit work-item issue
references. A dependency is complete only after its PR is verified merged and
`sdlc-reconcile` records completion. Cycles, missing dependencies, malformed
provenance, and ambiguous ownership are hard stops.

## Compatibility

Existing `.thin-slice.yml` records and thin-slice metadata remain readable by
audit and reconciliation. Do not convert or relabel legacy records
automatically. New records must use SDLC metadata and canonical labels.
