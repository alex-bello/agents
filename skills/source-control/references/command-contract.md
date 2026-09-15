# Command contract

Run provider commands as:

```sh
scripts/sc [global options] <resource> <action> [arguments]
```

Global options must precede the resource:

| Option | Meaning |
| --- | --- |
| `--provider auto\|forgejo\|github` | Override provider detection |
| `--repo OWNER/NAME` | Target a repository other than the current repository |
| `--remote NAME` | Select the Git remote used for detection; default `origin` |
| `--limit N` | Maximum list results; default `30`, maximum `100` |

## Commands

| Command | Required arguments | Optional arguments |
| --- | --- | --- |
| `provider` | none | none |
| `capabilities` | none | none |
| `auth status` | none | none |
| `repo view` | none | none |
| `label list` | none | none |
| `label create` | `--name TEXT` | `--color HEX`, `--description TEXT` |
| `issue list` | none | `--state open\|closed\|all`, repeated `--label NAME` |
| `issue view` | `NUMBER` | none |
| `issue comments` | `NUMBER` | none |
| `issue create` | `--title TEXT`, `--body-file PATH` | repeated `--label NAME` |
| `issue edit` | `NUMBER` | `--body-file PATH`, repeated `--add-label NAME`, repeated `--remove-label NAME` |
| `issue close` | `NUMBER` | none |
| `issue comment` | `NUMBER`, `--body-file PATH` | none |
| `pr list` | none | `--state open\|closed\|all` |
| `pr view` | `NUMBER` | none |
| `pr comments` | `NUMBER` | none |
| `pr edit` | `NUMBER`, `--body-file PATH` | none |
| `pr diff` | `NUMBER` | none |
| `pr checks` | `NUMBER` | none |
| `pr create` | `--base BRANCH`, `--head BRANCH`, `--title TEXT`, `--body-file PATH` | `--draft`, repeated `--label NAME` |
| `pr comment` | `NUMBER`, `--body-file PATH` | none |
| `pr ready` | `NUMBER` | none |
| `pr checkout` | `NUMBER` | none |

Create, edit, close, comment, and draft-promotion commands are externally visible writes. Checkout
changes the local worktree. Use them only when the user's request authorizes the
effect.

### Forgejo pull-request comments

`pr comments NUMBER` invokes Tea as:

```text
tea comments list NUMBER --output json
```

The Forgejo adapter supports these native response forms:

- A top-level JSON array containing comment objects. Tea may provide author,
  body, URL, and timestamp values using its native names (`author`/`user`,
  `body`/`content`, `url`/`html_url`, `createdAt`/`created`, and
  `updatedAt`/`updated`).
- Empty or whitespace-only output.
- A case-insensitive `No comments`, `No comments found`, or `No comments
  available` message, with an optional trailing `.` or `!`.

The wrapper returns the provider-neutral envelope shown below. Every comment
has the stable `id`, `author`, `body`, `url`, `createdAt`, and `updatedAt`
fields; an absent native value is represented as `null`. An empty response
returns `items: []` with exit status `0`.

```json
{
  "provider": "forgejo",
  "operation": "pr.comments",
  "repository": "owner/project",
  "number": 18,
  "items": [
    {
      "id": 19,
      "author": "alex",
      "body": "Looks good",
      "url": "https://forge.example/owner/project/pulls/18#issuecomment-19",
      "createdAt": "2026-09-14T05:30:00Z",
      "updatedAt": "2026-09-14T05:31:00Z"
    }
  ]
}
```

Malformed JSON or a non-array JSON value is a normalization failure (exit
status `8`). The diagnostic identifies the `pr.comments` operation and the
expected JSON-array-or-empty shape, but does not print the raw native output,
credentials, or authenticated URLs. For example:

```text
sc: could not normalize pr.comments output: expected a JSON array or empty output
```

The compatibility boundary is covered by
`tests/fixtures/forgejo-pr-comments-populated.json`,
`tests/fixtures/forgejo-pr-comments-empty.txt`, and
`tests/fixtures/forgejo-pr-comments-malformed.json`. Run the focused checks
with:

```sh
node --test --test-name-pattern="Forgejo pull-request comment" skills/source-control/tests/sc.test.mjs
```

## Output

The wrapper writes exactly one JSON object to stdout:

```json
{
  "provider": "github",
  "operation": "issue.list",
  "repository": "owner/name",
  "items": []
}
```

Common item fields are `number`, `title`, `body`, `state`, `author`, `url`,
`labels`, `createdAt`, and `updatedAt`. Fields unavailable from a provider are
`null` or omitted. Provider-specific response objects are not exposed.

`pr diff` is JSON with a `diff` string. `auth status` contains
`authenticated`. Edit and comment operations contain `success` and, when the
native CLI returns one, `url`. Issue close contains `number` and `success`.

Forgejo `issue.create` guarantees `number`, `success: true`, and the canonical
Forgejo `url`. Tea does not expose structured output for issue creation, so the
wrapper accepts only the final output line as the created URL, validates that
it identifies an issue in the target repository, and verifies its number,
title, and URL with a structured issue read before reporting success. Missing,
malformed, ambiguous, or mismatched output exits with code `8`. GitHub
`issue.create` preserves the v1 behavior of returning `success` and the native
URL when available; its issue number is not guaranteed.

`pr.create` returns the requested title, base, head, `state: "open"`, PR number,
and canonical `/pulls/<number>` URL. When native provider output is structured,
the wrapper uses its URL fields; otherwise it filters printed URLs to the target
repository's canonical PR routes on the detected provider host. GitHub accepts
`/pull/<number>`; Forgejo accepts `/pull/<number>` and `/pulls/<number>`. Issue,
tracker, comparison, documentation, and body URLs are ignored. Duplicate copies
of one canonical PR URL are accepted, while no usable candidate or multiple
distinct PR candidates exits with code `8`. The wrapper does not retry the
native create operation after a normalization failure.

`pr.ready` maps to `gh pr ready <number>` on GitHub and
`tea pulls edit <number> --ready` on Forgejo. It returns normalized provider,
repository, pull-request number, `success: true`, and URL data when the native
command provides it; otherwise it derives the canonical pull-request URL from
the detected remote host. Native failures propagate as exit code `7`, and an
unsupported provider operation returns exit code `4` with an actionable
diagnostic.

## Exit codes

| Code | Meaning | Recovery |
| --- | --- | --- |
| `0` | Success | none |
| `2` | Invalid command or arguments | correct the invocation |
| `3` | Provider could not be detected | pass `--provider` |
| `4` | Unsupported operation or capability | report the limitation |
| `5` | Required executable or file is missing | install/configure it or correct the path |
| `6` | Authentication failed | authenticate the selected native CLI |
| `7` | Native CLI command failed | read stderr; do not fall back to a raw API |
| `8` | Native output could not be normalized | report the incompatible output |

Diagnostics go to stderr. Credentials and authenticated remote URLs must never
be included in stdout.
