# Agent Instructions

Always use PNPM for package-management and project-script commands. Do not use
`npm`, `npx`, or another package manager in this repository.

Before creating any commit, run the repository validation script from the repository root:

```sh
pnpm run validate
```

Only create the commit if validation passes. If it fails, resolve the relevant validation errors first.
