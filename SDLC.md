# SDLC repository contract

This repository uses the unified SDLC workflow. `.sdlc.yml` is the machine-
validated configuration; the skills under `skills/sdlc/` are the source of
truth for agent behavior.

## Commands

```sh
pnpm run validate
pnpm run sdlc:validate-config -- .sdlc.yml
```

Use `sdlc-wayfinder` for planning and requirements, `sdlc-design` for approved
system design and work-item generation, `sdlc-orchestrate <work-item-id>` for
one implementation, `sdlc-orchestrate --batch` for scheduled bounded queue
execution, and `sdlc-reconcile <feature-issue-id>` after merges.

Batch execution requires isolated worktrees and uses the configured
`max_concurrency`. It may process independent work items, including items from
different features, but never bypasses explicit dependencies or provenance
gates. It never merges pull requests automatically.
