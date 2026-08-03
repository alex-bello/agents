# Common workflows

Inspect an issue without fetching unnecessary comments:

```sh
scripts/sc issue view 42
```

Read comments only when needed:

```sh
scripts/sc issue comments 42
```

List labeled work consistently on either provider:

```sh
scripts/sc --limit 50 issue list --state open --label "help wanted"
```

Create and publish a local branch with Git:

```sh
git switch -c codex/feature
git push -u origin codex/feature
```

Create an issue from prepared text:

```sh
scripts/sc issue create \
  --title "Document the deployment procedure" \
  --body-file /tmp/issue-body.md \
  --label documentation
```

Close an issue after confirming the requested external change:

```sh
scripts/sc issue close 42
```

Inspect a pull request:

```sh
scripts/sc pr view 17
scripts/sc pr diff 17
scripts/sc pr checks 17
```

Open a pull request after the branch has been pushed:

```sh
scripts/sc pr create \
  --base main \
  --head codex/source-control \
  --title "feat: add normalized source-control workflow" \
  --body-file /tmp/pr-body.md
```
