---
name: source-control
version: 1.2.0
description: Use Git for local source-control operations and one deterministic command interface for Forgejo and GitHub repository, issue, and pull-request operations. Use when an agent needs to inspect repository state, manage branches, list or view issues and pull requests, read comments or diffs, check CI, create, edit, or close an issue or pull request, comment, or check out a pull request.
---

# Source control

Use native `git` for operations built into Git. Use `scripts/sc` instead of
constructing `tea`, `gh`, or HTTP API commands for provider-level operations.
The wrapper detects Forgejo or GitHub, calls the corresponding CLI
noninteractively, and returns normalized JSON.

The command implementation is maintained in `src/cli.ts`. `scripts/sc` is the
generated Node-compatible bundle used by installed skills, so invoking it does
not require Bun. The installed CLI runtime supports Node.js 18 or newer. The
repository's development and validation toolchain requires Node.js 20.19 or
newer. From the repository root, `pnpm run sc:lint` lints the TypeScript source,
`pnpm run sc:typecheck` checks it with strict TypeScript settings, and
`pnpm run validate` runs both checks plus repository validation. `pnpm test`
runs those gates and the regression suites.

Run `pnpm run sc:build` to regenerate the portable Node bundle and produce a
host-specific standalone executable at `dist/sc`. Use
`pnpm run sc:dev -- <arguments>` to run the TypeScript source through Bun, or
run `./dist/sc <arguments>` after building. The standalone binary still uses
`git`, `gh`, and `tea` from `PATH` for repository and provider operations. Use
`--help` and `--version` to inspect the CLI; both work without a provider
configuration.

## Prerequisites

`sc` verifies the native tool for the provider in use before its first native
call (`tea` for Forgejo, `gh` for GitHub; the other tool is never checked).

| Tool | Minimum | Why |
| --- | --- | --- |
| `tea` | 0.15.0 | 0.14.1 `label list` omits org-level labels the repository inherits, so labels such as `status/committed` look missing |
| `gh` | 2.57.0 | `auth status --active` was added in 2.57.0; `pr checks --json` needs 2.50.0 |

A tool that is too old exits with code `9` and a message on stderr naming the
tool, installed and required versions, the symptom, and the fix, for example:
`sc: tea 0.14.1 is older than the minimum supported version 0.15.0: label list
omits the org-level labels a repository inherits, so existing labels look
missing. Fix: brew upgrade tea, or set SC_SKIP_VERSION_CHECK=1 to bypass this
check`. Stdout stays empty. Upgrade the tool rather than working around it.
`SC_SKIP_VERSION_CHECK=1` bypasses the check with a one-line warning; use it
only knowingly, because results from an old tool can be silently incomplete.
`sc provider`, `capabilities`, and `auth status` report the detected tool,
version, and minimum.

Git-native operations include status, diff, log, show, remotes, fetch, pull,
push, branch creation/listing, switch/checkout, add, commit, merge, rebase,
and tags. `scripts/sc` is for provider metadata and collaboration operations
such as issues, labels, pull requests, checks, and comments.

Use `scripts/sc issue edit <number> --add-label <name>` and
`--remove-label <name>` for label mutations. Repeat either option for multiple
labels; the wrapper translates these options to the native GitHub or Forgejo
CLI syntax.

Use `scripts/sc label delete --id <label-id>` to delete one repository label
and `scripts/sc issue remove-label <number> --id <label-id>` to detach one
label ID from an issue. Both commands resolve the complete label set in the
same repository for reads and writes. Name-based native mutations require a
unique exact name for the selected ID, and success is reported only after a
follow-up read verifies the requested state. Name-based `issue edit` label
mutations fail before writing when a name is ambiguous.

Use `scripts/sc pr ready <number>` to promote a draft pull request. The
provider-neutral operation maps to `gh pr ready <number>` on GitHub and
`tea pulls edit <number> --ready` on Forgejo, then returns normalized provider,
repository, pull-request number, success, and URL data. Call `sc pr view` after
promotion and require `draft: false` before reporting approval.

## Workflow

1. Run `scripts/sc provider` from the repository.
2. Run the narrowest read command that answers the request.
3. Read `references/command-contract.md` only when choosing arguments or
   interpreting failures.
4. Read `references/capability-matrix.md` only when an operation may differ
   between providers.
5. Before creating or changing anything visible to other people, confirm that
   the user requested that action. A request to inspect, diagnose, review, or
   summarize does not authorize a create or comment command.
6. Report the normalized result. Do not repeat a native CLI call merely to
   reformat its output.

## Rules

- Do not call `tea api`, `gh api`, `curl`, or provider MCP tools as a fallback.
- Do not improvise a provider CLI command when `scripts/sc` reports an
  unsupported operation. Explain the missing capability instead.
- Prefer `--body-file` over inline bodies. The wrapper intentionally rejects
  interactive input.
- Pass `--repo OWNER/NAME` when the target is not the current repository.
- Pass `--provider forgejo|github` when automatic detection is ambiguous.
- Treat `issue create`, `issue close`, `issue comment`, `pr create`, and `pr comment` as
  externally visible writes.
- Do not merge pull requests, delete, release, approve, reject, or resolve
  review threads with this skill. Those operations are outside the v1 contract.

## Verification

Use Git to create and switch local branches, then push them with Git before
using `scripts/sc pr create`. Pull-request checkout uses the existing
`pr checkout` operation because it
also fetches provider-hosted pull-request state.

Every successful command writes one JSON object to stdout. Verify that:

- `provider` is the expected provider;
- `operation` matches the requested operation;
- repository and item identifiers match the target; and
- write results contain a URL or an explicit success indication.

Exit code `0` means success. Other stable exit codes and recovery instructions
are documented in `references/command-contract.md`.
