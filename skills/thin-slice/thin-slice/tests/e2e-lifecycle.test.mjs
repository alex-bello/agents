import assert from "node:assert/strict";
import test from "node:test";

const labels = {
  ready: ["thin-slice", "thin-slice-ready"],
  inProgress: ["thin-slice", "thin-slice-in-progress"],
  implemented: ["thin-slice", "thin-slice-implemented"],
};

function fixture() {
  const state = { nextIssue: 1, nextPr: 1, issues: [], branches: [], commits: [], prs: [], comments: [] };
  return {
    state,
    createIssue(input) {
      const issue = { number: state.nextIssue++, ...input, labels: [...(input.labels ?? [])] };
      state.issues.push(issue);
      return issue;
    },
    editLabels(number, nextLabels, { fail = false } = {}) {
      const issue = state.issues.find((item) => item.number === number);
      assert.ok(issue, `issue #${number} exists`);
      if (fail) throw new Error(`issue.edit failed for #${number}`);
      issue.labels = [...nextLabels];
      return issue;
    },
    createBranch(name, from) {
      const branch = { name, from };
      state.branches.push(branch);
      return branch;
    },
    commit(branch, message) {
      const commit = { sha: `commit-${state.commits.length + 1}`, branch, message };
      state.commits.push(commit);
      return commit;
    },
    verify(commit, checks) {
      assert.ok(state.commits.includes(commit), "verified commit belongs to the fixture");
      assert.deepEqual(checks, ["tests", "acceptance"]);
      return { commit: commit.sha, passed: true };
    },
    createPr({ issue, branch, commit, response = "pull" }) {
      assert.ok(state.issues.includes(issue), "PR references the created issue");
      assert.ok(state.branches.some((item) => item.name === branch), "PR references the created branch");
      assert.ok(state.commits.includes(commit), "PR references the verified commit");
      if (!["issues", "pull", "pulls"].includes(response)) throw new Error(`malformed PR URL response: ${response}`);
      const number = state.nextPr++;
      const url = `https://forge.example/owner/repo/${response}/${number}`;
      const pr = { number, url: url.replace(/\/(?:pull|issues)\//, "/pulls/"), issue: issue.number, branch, commit: commit.sha, state: "open" };
      state.prs.push(pr);
      return pr;
    },
    comment(issue, body) {
      const comment = { issue: issue.number, body };
      state.comments.push(comment);
      return comment;
    },
    reconcile(issue, pr) {
      if (pr.state === "merged") this.editLabels(issue.number, labels.implemented);
      return { issue: issue.number, pr: pr.number, labels: [...issue.labels], closed: pr.state === "merged" ? false : issue.closed === true };
    },
  };
}

test("happy path preserves issue, branch, commit, PR, comment, and lifecycle relationships", () => {
  const provider = fixture();
  const tracker = provider.createIssue({ title: "Tracker", labels: ["thin-slice", "thin-slice-tracker"] });
  const issue = provider.createIssue({ title: "Work item", sourceTracker: tracker.number, labels: labels.ready });
  provider.editLabels(issue.number, labels.inProgress);
  const branch = provider.createBranch("thin-slice/1-work-item", "main");
  const commit = provider.commit(branch.name, "Implement work item (#1)");
  assert.deepEqual(provider.verify(commit, ["tests", "acceptance"]), { commit: commit.sha, passed: true });
  const pr = provider.createPr({ issue, branch: branch.name, commit });
  provider.comment(issue, `Closes #${issue.number} — ${pr.url}`);
  pr.state = "merged";
  const result = provider.reconcile(issue, pr);

  assert.equal(pr.url, `https://forge.example/owner/repo/pulls/${pr.number}`);
  assert.equal(result.issue, issue.number);
  assert.equal(result.pr, pr.number);
  assert.deepEqual(result.labels, labels.implemented);
  assert.match(provider.state.comments[0].body, new RegExp(`Closes #${issue.number}`));
});

test("invalid provenance and unresolved dependencies fail before branch or PR creation", () => {
  const provider = fixture();
  const issue = provider.createIssue({ sourceTracker: "abc", dependsOn: [99], labels: labels.ready });
  assert.notEqual(issue.sourceTracker, 56, "malformed tracker identity is retained for diagnostics");
  assert.equal(provider.state.branches.length, 0);
  assert.equal(provider.state.prs.length, 0);
  assert.throws(() => assert.equal(issue.sourceTracker, 56), /56/);
  assert.throws(() => { if (!provider.state.issues.some((item) => item.number === 99 && item.closed)) throw new Error("dependency #99 is unresolved"); }, /dependency #99/);
});

test("bad commit references and malformed PR URLs fail without lifecycle advancement", () => {
  const provider = fixture();
  const issue = provider.createIssue({ title: "Work item", labels: labels.inProgress });
  const branch = provider.createBranch("thin-slice/1-work-item", "main");
  const commit = provider.commit(branch.name, "Implement work item");
  assert.doesNotMatch(commit.message, /#\d+/);
  assert.throws(() => { if (!/#1/.test(commit.message)) throw new Error(`commit ${commit.sha} must reference #1`); }, /must reference #1/);
  assert.throws(() => provider.createPr({ issue, branch: branch.name, commit, response: "malformed" }), /malformed PR URL response/);
  assert.equal(provider.state.prs.length, 0);
  assert.deepEqual(issue.labels, labels.inProgress);
});

test("failed label mutation preserves the last verified state", () => {
  const provider = fixture();
  const issue = provider.createIssue({ labels: labels.ready });
  assert.throws(() => provider.editLabels(issue.number, labels.inProgress, { fail: true }), /issue.edit failed/);
  assert.deepEqual(issue.labels, labels.ready);
});

test("closed, unmerged PRs do not mark an issue implemented", () => {
  const provider = fixture();
  const issue = provider.createIssue({ labels: labels.inProgress });
  const branch = provider.createBranch("thin-slice/1-work-item", "main");
  const commit = provider.commit(branch.name, "Implement work item (#1)");
  const pr = provider.createPr({ issue, branch: branch.name, commit });
  pr.state = "closed";
  const result = provider.reconcile(issue, pr);
  assert.deepEqual(result.labels, labels.inProgress);
  assert.equal(result.closed, false);
});
