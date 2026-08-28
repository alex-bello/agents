import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const issueNumber = 93;
const shortSlug = "exercise-real-git-worktree-lifecycle-in-integratio";

function git(repository, args, options = {}) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

async function createRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "thin-slice-worktree-"));
  const repository = path.join(root, "agents");
  const worktree = path.join(root, ".thin-slice-worktrees", "agents", `${issueNumber}-${shortSlug}`);

  await rm(repository, { recursive: true, force: true });
  execFileSync("git", ["init", "--initial-branch=main", repository], { encoding: "utf8" });
  git(repository, ["config", "user.name", "Thin Slice Fixture"]);
  git(repository, ["config", "user.email", "thin-slice-fixture@example.test"]);
  await writeFile(path.join(repository, "README.md"), "fixture\n");
  git(repository, ["add", "README.md"]);
  git(repository, ["commit", "-m", "Initialize fixture"]);

  return { root, repository, worktree };
}

function worktreeRecords(repository) {
  const lines = git(repository, ["worktree", "list", "--porcelain"]).split("\n");
  const records = [];
  let record;
  for (const line of [...lines, ""]) {
    if (!line) {
      if (record) records.push(record);
      record = undefined;
      continue;
    }
    const [key, ...value] = line.split(" ");
    if (key === "worktree") record = { path: value.join(" ") };
    if (record && key === "branch") record.branch = value.join(" ").replace(/^refs\/heads\//, "");
  }
  return records;
}

function registeredWorktree(repository, worktree) {
  let target;
  try {
    target = realpathSync(worktree);
  } catch {
    return undefined;
  }
  return worktreeRecords(repository).find((record) => realpathSync(record.path) === target);
}

function implementationPath(root) {
  return path.join(root, ".thin-slice-worktrees", "agents", `${issueNumber}-${shortSlug}`);
}

function addImplementationWorktree(repository, worktree) {
  const branch = `thin-slice/${issueNumber}-${shortSlug}`;
  git(repository, ["worktree", "add", "-b", branch, worktree, "HEAD"]);
  const record = registeredWorktree(repository, worktree);
  assert.ok(record);
  assert.equal(realpathSync(record.path), realpathSync(worktree));
  assert.equal(record.branch, branch);
  return branch;
}

function cleanupMergedWorktree({ repository, worktree, branch, prState }) {
  if (prState !== "merged") {
    throw new Error(`worktree cleanup refused: pull request state "${prState ?? "unconfirmed"}" is not confirmed merged; preserve ${worktree}`);
  }

  const record = registeredWorktree(repository, worktree);
  if (!record || record.branch !== branch) {
    throw new Error(`worktree cleanup refused: registered path/branch mismatch for ${worktree}; preserve the worktree`);
  }

  const status = git(worktree, ["status", "--short"]);
  if (status) {
    throw new Error(`worktree cleanup refused: worktree is dirty; preserve ${worktree}`);
  }

  git(repository, ["worktree", "remove", worktree]);
  assert.equal(registeredWorktree(repository, worktree), undefined);
  assert.equal(git(repository, ["branch", "--list", branch]), branch);
}

test("real Git worktree lifecycle isolates implementation and preserves the primary checkout", async () => {
  const fixture = await createRepository();
  try {
    const primaryBranch = git(fixture.repository, ["branch", "--show-current"]);
    const branch = addImplementationWorktree(fixture.repository, fixture.worktree);

    assert.equal(primaryBranch, "main");
    assert.equal(git(fixture.repository, ["branch", "--show-current"]), "main");
    assert.equal(realpathSync(implementationPath(fixture.root)), realpathSync(fixture.worktree));
    assert.equal(git(fixture.worktree, ["branch", "--show-current"]), branch);
    assert.equal(realpathSync(git(fixture.worktree, ["rev-parse", "--show-toplevel"])), realpathSync(fixture.worktree));

    await writeFile(path.join(fixture.worktree, "implementation.txt"), `${fixture.worktree}\n${branch}\n`);
    git(fixture.worktree, ["add", "implementation.txt"]);
    git(fixture.worktree, ["commit", "-m", `Exercise worktree lifecycle (#${issueNumber})`]);
    const evidence = await readFile(path.join(fixture.worktree, "implementation.txt"), "utf8");
    assert.match(evidence, new RegExp(fixture.worktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(git(fixture.repository, ["branch", "--show-current"]), "main");

    cleanupMergedWorktree({ ...fixture, branch, prState: "merged" });
    assert.equal(git(fixture.repository, ["branch", "--show-current"]), "main");
    assert.equal(git(fixture.repository, ["branch", "--list", branch]), branch);
    assert.deepEqual(worktreeRecords(fixture.repository).map((record) => realpathSync(record.path)), [realpathSync(fixture.repository)]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("real Git cleanup refuses unsafe states and preserves the registered worktree", async (t) => {
  const cases = [
    {
      name: "dirty worktrees",
      prepare: async (fixture) => writeFile(path.join(fixture.worktree, "README.md"), "local edit\n"),
      expected: /worktree is dirty/,
      prState: "merged",
    },
    {
      name: "mismatched branch/path records",
      expected: /registered path\/branch mismatch/,
      prState: "merged",
      mismatch: true,
    },
    { name: "open PRs", expected: /not confirmed merged/, prState: "open" },
    { name: "closed-unmerged PRs", expected: /not confirmed merged/, prState: "closed-unmerged" },
    { name: "unconfirmed PR state", expected: /not confirmed merged/, prState: null },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const fixture = await createRepository();
      try {
        const branch = addImplementationWorktree(fixture.repository, fixture.worktree);
        if (scenario.prepare) await scenario.prepare(fixture);
        const cleanupArgs = {
          ...fixture,
          branch: scenario.mismatch ? `${branch}-different` : branch,
          prState: scenario.prState,
        };
        assert.throws(() => cleanupMergedWorktree(cleanupArgs), scenario.expected);
        assert.ok(registeredWorktree(fixture.repository, fixture.worktree));
        assert.equal(git(fixture.repository, ["branch", "--show-current"]), "main");

        if (scenario.name === "dirty worktrees") {
          git(fixture.worktree, ["restore", "README.md"]);
        }
        cleanupMergedWorktree({ ...fixture, branch, prState: "merged" });
        assert.equal(registeredWorktree(fixture.repository, fixture.worktree), undefined);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    });
  }
});
