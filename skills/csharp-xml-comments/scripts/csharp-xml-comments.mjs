#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import process from "node:process";

const EXCLUDED_DIRECTORIES = new Set([".git", ".vs", "bin", "node_modules", "obj", "TestResults"]);
const USAGE = "Usage: csharp-xml-comments.mjs <targets|normalize|verify> [file-or-path-glob]";

function fail(message) {
  process.stderr.write(`csharp-xml-comments: ${message}\n`);
  process.exitCode = 2;
}

function slash(value) {
  return value.split(sep).join("/");
}

function globPattern(value) {
  const pattern = slash(value);
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
      } else {
        expression += ".*";
        index += 1;
      }
    } else if (character === "*") expression += "[^/]*";
    else if (character === "?") expression += "[^/]";
    else expression += /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
  }
  return new RegExp(`^${expression}$`);
}

function csharpFiles(directory, root = directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) files.push(...csharpFiles(resolve(directory, entry.name), root));
    } else if (entry.isFile() && entry.name.endsWith(".cs")) {
      files.push(slash(relative(root, resolve(directory, entry.name))));
    }
  }
  return files;
}

function targets(target) {
  const root = process.cwd();
  if (!target) return csharpFiles(root).sort();
  const absolute = resolve(root, target);
  if (existsSync(absolute)) {
    const stats = statSync(absolute);
    if (stats.isFile()) return absolute.endsWith(".cs") ? [slash(relative(root, absolute))] : [];
    if (stats.isDirectory()) return csharpFiles(absolute, root).sort();
  }
  const expression = globPattern(target.replace(/^\.\//, ""));
  return csharpFiles(root).filter((file) => expression.test(file)).sort();
}

function inlineSummaries(contents) {
  const findings = [];
  const lines = contents.split(/\r?\n/);
  const inline = /^\s*\/\/\/\s*<summary>(.+)<\/summary>\s*$/;
  lines.forEach((line, index) => {
    if (inline.test(line)) findings.push(index + 1);
  });
  return findings;
}

function normalize(contents) {
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  return contents.replace(/^(\s*\/\/\/)\s*<summary>([^<\r\n]+)<\/summary>\s*$/gm,
    (_, prefix, value) => `${prefix} <summary>${newline}${prefix} ${value.trim()}${newline}${prefix} </summary>`);
}

const [command, target] = process.argv.slice(2);
if (!command || !["targets", "normalize", "verify"].includes(command) || process.argv.length > 4) {
  fail(USAGE);
} else {
  const files = targets(target);
  if (files.length === 0) {
    process.stderr.write("csharp-xml-comments: no C# files matched the target\n");
    process.exitCode = 3;
  } else if (command === "targets") {
    process.stdout.write(`${files.join("\n")}\n`);
  } else if (command === "normalize") {
    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      const formatted = normalize(contents);
      if (formatted !== contents) writeFileSync(file, formatted);
    }
    process.stdout.write(`${files.length} C# file${files.length === 1 ? "" : "s"} normalized\n`);
  } else {
    const violations = files.flatMap((file) => inlineSummaries(readFileSync(file, "utf8")).map((line) => `${file}:${line}`));
    if (violations.length) {
      process.stderr.write(`csharp-xml-comments: inline <summary> content found:\n${violations.join("\n")}\n`);
      process.exitCode = 1;
    } else process.stdout.write(`${files.length} C# file${files.length === 1 ? "" : "s"} verified\n`);
  }
}
