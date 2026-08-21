import assert from "node:assert/strict";
import test from "node:test";

const transitions = {
  ready: ["thin-slice", "thin-slice-ready"],
  "in-progress": ["thin-slice", "thin-slice-in-progress"],
  implemented: ["thin-slice", "thin-slice-implemented"],
  discovery: ["thin-slice", "thin-slice-needs-discovery"],
  blocked: ["thin-slice", "thin-slice-blocked"],
};

function transition(state, next, mutation) {
  if (!mutation.ok) return { state, diagnostic: `issue.edit failed: ${mutation.error}` };
  return { state: transitions[next], diagnostic: null };
}

test("fixture defines exact normalized labels for every lifecycle state", () => {
  assert.deepEqual(Object.keys(transitions), ["ready", "in-progress", "implemented", "discovery", "blocked"]);
  assert.deepEqual(transitions.ready, ["thin-slice", "thin-slice-ready"]);
  assert.deepEqual(transitions["in-progress"], ["thin-slice", "thin-slice-in-progress"]);
  assert.deepEqual(transitions.implemented, ["thin-slice", "thin-slice-implemented"]);
  assert.deepEqual(transitions.discovery, ["thin-slice", "thin-slice-needs-discovery"]);
  assert.deepEqual(transitions.blocked, ["thin-slice", "thin-slice-blocked"]);
});

test("failed mutation preserves the last verified state and diagnoses the operation", () => {
  const previous = transitions.ready;
  const result = transition(previous, "in-progress", { ok: false, error: "permission denied" });
  assert.deepEqual(result.state, previous);
  assert.equal(result.diagnostic, "issue.edit failed: permission denied");
});

test("successful mutation changes only the configured lifecycle labels", () => {
  const result = transition(transitions.ready, "implemented", { ok: true });
  assert.deepEqual(result.state, transitions.implemented);
  assert.deepEqual(result.state.filter((label) => label === "thin-slice"), ["thin-slice"]);
});
