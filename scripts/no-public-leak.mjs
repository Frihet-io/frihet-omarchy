#!/usr/bin/env node
"use strict";

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const failures = [];

function walkFiles(dirPath) {
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "__pycache__") continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

const BINARY_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".ico", ".icns", ".woff", ".woff2", ".tgz"]);
const COMPETITOR_RE = /\b(holded|quickbooks|anfix|contasimple|quipu|odoo|billin|sage|factorial|a3erp|declarando|txerpa|xero|zoho)\b/i;
const INTERNAL_MARKERS = [
  /SOUL\.md/i,
  /NORTH\.md/i,
  /\/Users\//,
  /viktor@brthls/i,
  /\blitellm\b/i,
  /sonnet worker/i,
  /multi-agent dispatch/i,
  /cloudfunctions\.net/i,
  /\.run\.app\b/i,
  /tools\/omarchy/
];
const SECRET_PATTERNS = [
  /BEGIN (?:RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY/,
  /ghp_[A-Za-z0-9]{36}/,
  /github_pat_[A-Za-z0-9_]{82}/,
  /sk_live_[A-Za-z0-9]{16,}/,
  /AIzaSy[A-Za-z0-9_-]{20,}/,
  /sntry[su]_[A-Za-z0-9_-]{16,}/
];

for (const filePath of walkFiles(REPO_ROOT)) {
  const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
  if (relPath === "scripts/no-public-leak.mjs") continue;

  const base = path.basename(relPath);
  if (/^\.env(\..+)?$/i.test(base) && base !== ".env.example") {
    failures.push(`Forbidden credential file in repo: ${relPath}`);
    continue;
  }
  if (base.endsWith(".bak") || base.endsWith(".pyc")) {
    failures.push(`Artifact should not be committed: ${relPath}`);
  }

  if (BINARY_EXTS.has(path.extname(relPath).toLowerCase())) continue;

  const content = fs.readFileSync(filePath, "utf8");

  for (const re of SECRET_PATTERNS) {
    if (re.test(content)) {
      failures.push(`Secret pattern ${re} matched in ${relPath}`);
    }
  }

  if (relPath !== "tests/omarchy-suite.test.mjs" && relPath !== "README.md" && /fri_[A-Za-z0-9_-]{8,}/.test(content)) {
    failures.push(`Literal fri_* API token pattern found in ${relPath}`);
  }
  if (relPath === "README.md" && /fri_(?!your_key_here\b)[A-Za-z0-9_-]{8,}/.test(content)) {
    failures.push(`Non-placeholder fri_* token found in README.md`);
  }

  if (COMPETITOR_RE.test(content)) {
    failures.push(`Competitor name found in ${relPath}`);
  }

  for (const re of INTERNAL_MARKERS) {
    if (re.test(content)) {
      failures.push(`Internal marker ${re} found in ${relPath}`);
    }
  }
}

if (fs.existsSync(path.join(REPO_ROOT, ".git"))) {
  try {
    const gitLog = execFileSync("git", ["log", "--format=%an <%ae>%n%B"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    });
    if (/viktor@brthls/i.test(gitLog)) {
      failures.push("Personal email viktor@brthls found in git history");
    }
    if (/^Agent:/im.test(gitLog)) {
      failures.push("Internal Agent: commit trailer found in git history");
    }
  } catch (err) {
    failures.push(`Unable to audit git log: ${err.message}`);
  }
}

if (failures.length > 0) {
  for (const msg of failures) {
    process.stderr.write(`✗ ${msg}\n`);
  }
  process.exit(1);
}

process.stdout.write("✓ no-public-leak: clean\n");
