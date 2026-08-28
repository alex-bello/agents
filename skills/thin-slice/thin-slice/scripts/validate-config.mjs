import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const migrate = args.includes("--migrate");
const file = args.find((arg) => !arg.startsWith("--")) ?? ".thin-slice.yml";
const errors = [];
let source;
try {
  source = await readFile(file, "utf8");
} catch (cause) {
  console.error(`Invalid ${file}:\n- cannot read configuration: ${cause.message}\n- create it with the schema-1 template from thin-slice-setup, then rerun validation`);
  process.exitCode = 1;
}
if (source === undefined) process.exit();
const values = new Map();
const sections = new Set(["labels", "branch", "implementation", "pull_request", "verification"]);
const keys = new Map([
  ["labels", new Set(["mode", "vocabulary", "mappings"])],
  ["branch", new Set(["pattern", "default"])],
  ["implementation", new Set(["create_branch", "use_worktree", "worktree_root", "commit_reference_required", "ready_label", "in_progress_label", "implemented_label", "blocked_label", "needs_discovery_label", "automatic_lifecycle"])],
  ["pull_request", new Set(["creation", "close_work_item_on_merge"])],
  ["verification", new Set(["require_tests", "require_acceptance_checks", "require_manual_evidence_when_relevant", "reject_unrelated_changes"])],
]);
function error(line, message) { errors.push(`${file}:${line}: ${message}`); }
function diagnostic(line, message, fix) { error(line, `${message}; ${fix}`); }
function scalar(raw, line) {
  const value = raw.trim();
  if (!value) return "";
  if (/^(true|false)$/.test(value)) return value === "true";
  if (/^\d+$/.test(value)) return Number(value);
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  if (/^[\[\{]/.test(value)) { try { return JSON.parse(value.replaceAll("'", '"')); } catch { error(line, `expected a valid inline value, got ${value}`); return null; } }
  return value;
}
let section = "";
for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
  const line = index + 1; const content = rawLine.replace(/\s+#.*$/, "").trimEnd();
  if (!content.trim()) continue;
  const top = content.match(/^([A-Za-z][\w-]*):(?:\s*(.*))?$/);
  if (/^\s/.test(content) && !/^\s{2}\S/.test(content)) { error(line, "nested keys must be indented by two spaces"); continue; }
  if (top) { section = top[1]; if (section !== "schema" && !sections.has(section)) error(line, `unknown top-level key ${section}`); if (values.has(section)) error(line, `duplicate key ${section}`); values.set(section, top[2] === undefined || top[2] === "" ? {} : scalar(top[2], line)); continue; }
  const nested = content.match(/^\s+([A-Za-z][\w-]*):(?:\s*(.*))?$/);
  if (!nested) { error(line, "expected a top-level or indented key"); continue; }
  if (!sections.has(section)) { error(line, `unknown section ${section || "<none>"}`); continue; }
  const key = `${section}.${nested[1]}`;
  if (!keys.get(section).has(nested[1])) error(line, `unknown key ${key}`);
  if (values.has(key)) error(line, `duplicate key ${key}`);
  if (values.get(section) !== null && typeof values.get(section) !== "object") error(line, `${section} must be a mapping`);
  values.set(key, nested[2] === undefined || nested[2] === "" ? {} : scalar(nested[2], line));
}
function requireValue(key, description = key) { if (!values.has(key) || values.get(key) === "" || values.get(key) === null) error(1, `${description} is required`); return values.get(key); }
function type(key, expected) { if (values.has(key) && typeof values.get(key) !== expected) error(1, `${key} must be ${expected}`); }
function enumValue(key, allowed) { if (values.has(key) && !allowed.includes(values.get(key))) error(1, `${key} must be one of: ${allowed.join(", ")}`); }
const schema = requireValue("schema", "schema");
type("schema", "number");
if (schema !== 1) {
  const observed = schema === undefined ? "missing" : JSON.stringify(schema);
  error(1, "schema must be 1");
  diagnostic(1, `unsupported schema ${observed}`, "run thin-slice-setup or use --migrate when a migration is available");
}
for (const name of sections) if (!values.has(name)) error(1, `missing top-level section ${name}`);
for (const name of sections) if (values.get(name) !== undefined && (values.get(name) === null || typeof values.get(name) !== "object" || Array.isArray(values.get(name)))) error(1, `${name} must be a mapping`);
requireValue("branch.pattern", "branch.pattern"); type("branch.pattern", "string");
if (typeof values.get("branch.pattern") === "string" && (!values.get("branch.pattern").includes("{issue-number}") || !values.get("branch.pattern").includes("{short-slug}"))) error(1, "branch.pattern must contain {issue-number} and {short-slug}");
if (values.has("branch.default")) { type("branch.default", "string"); if (typeof values.get("branch.default") === "string" && !values.get("branch.default").trim()) error(1, "branch.default must not be empty"); }
for (const key of ["labels.mode", "pull_request.creation"]) requireValue(key);
type("labels.mode", "string"); type("pull_request.creation", "string"); enumValue("labels.mode", ["mapped", "native"]); enumValue("pull_request.creation", ["never", "ask", "automatic"]);
const bools = ["implementation.create_branch", "implementation.commit_reference_required", "implementation.automatic_lifecycle", "pull_request.close_work_item_on_merge", "verification.require_tests", "verification.require_acceptance_checks", "verification.require_manual_evidence_when_relevant", "verification.reject_unrelated_changes"];
for (const key of bools) { requireValue(key); type(key, "boolean"); }
if (values.has("implementation.use_worktree")) type("implementation.use_worktree", "boolean");
if (values.has("implementation.worktree_root")) { type("implementation.worktree_root", "string"); if (typeof values.get("implementation.worktree_root") === "string" && !values.get("implementation.worktree_root").trim()) error(1, "implementation.worktree_root must not be empty"); }
for (const key of ["implementation.ready_label", "implementation.in_progress_label", "implementation.implemented_label", "implementation.blocked_label", "implementation.needs_discovery_label"]) { const value = requireValue(key); type(key, "string"); if (typeof value === "string" && !value.trim()) error(1, `${key} must not be empty`); }
if (errors.length) {
  console.error(`Invalid ${file}:\n${errors.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else if (migrate) {
  // Migration is deliberately opt-in and atomic: validation must succeed before
  // the file is replaced. Schema 1 is the current canonical representation, so
  // this also gives older callers a stable migration entry point.
  await writeFile(file, source.endsWith("\n") ? source : `${source}\n`);
  console.log(`Migrated ${file} to schema 1`);
} else console.log(`Valid ${file} (schema 1)`);
