#!/usr/bin/env node
"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

const scannedExtensions = new Set([
  ".js",
  ".cjs",
  ".mjs",
  ".json",
  ".md",
  ".css",
  ".html",
  ".yml",
  ".yaml",
  ".txt",
  ".ps1",
  ".sh",
  ".toml",
  ".ini",
  ".conf"
]);

const scannedFilenames = new Set([
  "Dockerfile",
  "LICENSE",
  ".gitignore",
  ".dockerignore"
]);

const suspiciousPatterns = [
  {
    code: "cp866-box",
    description: "possible UTF-8 text decoded with CP866",
    regex: /[\u2564\u2568]/u
  },
  {
    code: "cp866-token",
    description: "possible mojibake token starting with Cyrillic 'т'",
    regex: /\u0442[A-Z\u0410-\u042F]/u
  },
  {
    code: "emoji-token",
    description: "possible mojibake emoji token",
    regex: /\u0401\u042F/u
  },
  {
    code: "replacement-char",
    description: "replacement character found",
    regex: /\uFFFD/u
  }
];

function isScannableFile(relativePath) {
  if (relativePath.startsWith("node_modules/") || relativePath.startsWith(".git/")) {
    return false;
  }

  const base = path.basename(relativePath);
  const ext = path.extname(relativePath).toLowerCase();

  if (scannedExtensions.has(ext)) {
    return true;
  }

  if (scannedFilenames.has(base)) {
    return true;
  }

  if (base.startsWith(".env")) {
    return true;
  }

  return false;
}

function lineAndSnippet(text, index) {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  const lines = text.split(/\r?\n/);
  let cursor = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const lineLength = lines[i].length + 1;
    if (safeIndex < cursor + lineLength) {
      return {
        line: i + 1,
        snippet: lines[i].trim().slice(0, 180)
      };
    }
    cursor += lineLength;
  }

  return {
    line: lines.length,
    snippet: (lines[lines.length - 1] || "").trim().slice(0, 180)
  };
}

function getTrackedFiles() {
  const output = execSync("git ls-files -z", { encoding: "buffer" });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"));
}

const issues = [];
let scannedCount = 0;

for (const relativePath of getTrackedFiles()) {
  if (!isScannableFile(relativePath)) {
    continue;
  }

  const absolutePath = path.resolve(process.cwd(), relativePath);
  const bytes = fs.readFileSync(absolutePath);
  scannedCount += 1;

  if (bytes.length >= 2) {
    const isUtf16LeBom = bytes[0] === 0xff && bytes[1] === 0xfe;
    const isUtf16BeBom = bytes[0] === 0xfe && bytes[1] === 0xff;
    if (isUtf16LeBom || isUtf16BeBom) {
      issues.push({
        path: relativePath,
        reason: "UTF-16 BOM detected",
        line: 1,
        snippet: ""
      });
      continue;
    }
  }

  const nulIndex = bytes.indexOf(0x00);
  if (nulIndex !== -1) {
    issues.push({
      path: relativePath,
      reason: "NUL byte detected",
      line: 1,
      snippet: ""
    });
    continue;
  }

  let text;
  try {
    text = utf8Decoder.decode(bytes);
  } catch (error) {
    issues.push({
      path: relativePath,
      reason: `invalid UTF-8 (${error.message})`,
      line: 1,
      snippet: ""
    });
    continue;
  }

  for (const pattern of suspiciousPatterns) {
    const match = pattern.regex.exec(text);
    if (!match) {
      continue;
    }

    const { line, snippet } = lineAndSnippet(text, match.index);
    issues.push({
      path: relativePath,
      reason: `${pattern.code}: ${pattern.description}`,
      line,
      snippet
    });
    break;
  }
}

if (issues.length > 0) {
  console.error("[encoding-check] Failed. Suspicious encoding issues were found:\n");
  for (const issue of issues) {
    const linePart = issue.line ? `:${issue.line}` : "";
    console.error(`- ${issue.path}${linePart} -> ${issue.reason}`);
    if (issue.snippet) {
      console.error(`  ${issue.snippet}`);
    }
  }
  process.exit(1);
}

console.log(`[encoding-check] OK. Scanned ${scannedCount} tracked text files.`);
