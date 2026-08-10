import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const skillsRoot = path.join(root, "skills");
const errors = [];
const names = new Map();

async function skillFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md") files.push(entryPath);
    if (entry.isDirectory()) files.push(...(await skillFiles(entryPath)));
  }

  return files;
}

function parseFrontmatter(contents) {
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z][a-z0-9-]*):\s*(.+?)\s*$/);
    if (field) values[field[1]] = field[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

let files = [];
try {
  files = await skillFiles(skillsRoot);
} catch (error) {
  errors.push(`Cannot read skills directory: ${error.message}`);
}

for (const file of files) {
  const relative = path.relative(root, file);
  const contents = await readFile(file, "utf8");
  const frontmatter = parseFrontmatter(contents);

  if (!frontmatter) {
    errors.push(`${relative}: missing YAML frontmatter`);
    continue;
  }

  const name = frontmatter.name;
  const version = frontmatter.version;
  const description = frontmatter.description;
  const directoryName = path.basename(path.dirname(file));

  if (!name) errors.push(`${relative}: missing name`);
  if (!version) errors.push(`${relative}: missing version`);
  if (version && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    errors.push(`${relative}: version must use semantic versioning (for example, 1.0.0)`);
  }
  if (!description) errors.push(`${relative}: missing description`);
  if (name && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    errors.push(`${relative}: name must be lowercase kebab-case`);
  }
  if (name && name !== directoryName) {
    errors.push(`${relative}: name "${name}" must match directory "${directoryName}"`);
  }
  if (name && names.has(name)) {
    errors.push(`${relative}: duplicate name also used by ${names.get(name)}`);
  } else if (name) {
    names.set(name, relative);
  }
  if (description && description.length < 20) {
    errors.push(`${relative}: description is too short to explain its trigger`);
  }
  if (/(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][^"']+["']/i.test(contents)) {
    errors.push(`${relative}: possible committed secret`);
  }
}

if (files.length === 0) errors.push("No skills/<name>/SKILL.md files found");

if (errors.length > 0) {
  console.error(`Validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${files.length} skill${files.length === 1 ? "" : "s"}:`);
  for (const name of [...names.keys()].sort()) console.log(`- ${name}`);
}
