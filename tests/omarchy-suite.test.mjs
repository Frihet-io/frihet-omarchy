import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import vm from "node:vm";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const PINNED_BRAND_SHA256 = {
  "frihet-mark-ink.svg": "05df4b5d16b9fe50e82487a77323181c3d2858585da62ae6e7f1340dff793c3a",
  "frihet-mark-white.svg": "89e3fa3bdc67a1da5d50670c5e311e253cdaf7497a29211bf58477b0fbf3a2f5"
};

function loadModelJs() {
  const modelPath = path.join(REPO_ROOT, "Model.js");
  const code = fs.readFileSync(modelPath, "utf8");
  const mod = { exports: {} };
  const context = vm.createContext({
    module: mod,
    exports: mod.exports,
    Object,
    Array,
    Math,
    String,
    Number,
    JSON,
    isFinite
  });
  vm.runInContext(code, context, { filename: modelPath });
  return mod.exports;
}

const Model = loadModelJs();
const FETCH_BIN = path.join(REPO_ROOT, "bin", "frihet-omarchy-fetch");
const SETUP_BIN = path.join(REPO_ROOT, "aur", "frihet-mcp", "frihet-omarchy-setup");
const CLI_BIN = path.join(REPO_ROOT, "aur", "frihet-mcp", "frihet-cli");

function sha256File(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function walkFiles(dirPath) {
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

function parsePkgbuildArray(content, varName) {
  const regex = new RegExp(`${varName}=\\(([\\s\\S]*?)\\)`, "m");
  const match = content.match(regex);
  assert.ok(match, `Missing ${varName}=(...) in PKGBUILD`);
  const items = [];
  const tokenRegex = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = tokenRegex.exec(match[1])) !== null) {
    items.push(m[1] ?? m[2] ?? m[3]);
  }
  return items;
}

function parseSrcinfoKey(content, key) {
  const values = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    const prefix = `${key} = `;
    if (trimmed.startsWith(prefix)) {
      values.push(trimmed.slice(prefix.length).trim());
    }
  }
  return values;
}

function extractQmlTextBlocks(qmlSource) {
  const blocks = [];
  const startRegex = /\bText\s*\{/g;
  let match;
  while ((match = startRegex.exec(qmlSource)) !== null) {
    let idx = match.index + match[0].length;
    let depth = 1;
    let inString = false;
    let stringChar = "";
    while (idx < qmlSource.length && depth > 0) {
      const ch = qmlSource[idx];
      const prev = qmlSource[idx - 1];
      if (inString) {
        if (ch === stringChar && prev !== "\\") {
          inString = false;
        }
      } else if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
      }
      idx++;
    }
    assert.equal(depth, 0, "Unbalanced braces in QML Text block");
    blocks.push(qmlSource.slice(match.index, idx));
  }
  return blocks;
}

test("1. Brand OS v1 SHA-256 parity on copied webapp SVGs", () => {
  const webappDir = path.join(REPO_ROOT, "aur", "frihet-webapp");

  assert.equal(
    sha256File(path.join(webappDir, "frihet-mark-ink.svg")),
    PINNED_BRAND_SHA256["frihet-mark-ink.svg"]
  );
  assert.equal(
    sha256File(path.join(webappDir, "frihet-mark-white.svg")),
    PINNED_BRAND_SHA256["frihet-mark-white.svg"]
  );
});

test("2. PKGBUILD & .SRCINFO integrity and checksum parity", () => {
  const pkgDirs = [
    path.join(REPO_ROOT, "aur", "frihet-webapp"),
    path.join(REPO_ROOT, "aur", "frihet-mcp")
  ];

  for (const dir of pkgDirs) {
    const pkgbuild = fs.readFileSync(path.join(dir, "PKGBUILD"), "utf8");
    const srcinfo = fs.readFileSync(path.join(dir, ".SRCINFO"), "utf8");

    const pkgSources = parsePkgbuildArray(pkgbuild, "source");
    const pkgSums = parsePkgbuildArray(pkgbuild, "sha256sums");
    const srcSources = parseSrcinfoKey(srcinfo, "source");
    const srcSums = parseSrcinfoKey(srcinfo, "sha256sums");

    assert.equal(pkgSources.length, pkgSums.length, `${dir}: source/sha256sums length mismatch in PKGBUILD`);
    assert.equal(srcSources.length, srcSums.length, `${dir}: source/sha256sums length mismatch in .SRCINFO`);
    assert.deepEqual(pkgSums, srcSums, `${dir}: PKGBUILD vs .SRCINFO sha256sums mismatch`);

    for (let i = 0; i < pkgSources.length; i++) {
      const entry = pkgSources[i];
      const expectedHash = pkgSums[i];
      assert.notEqual(expectedHash.toUpperCase(), "SKIP", `${dir}: SKIP checksum forbidden`);
      assert.match(expectedHash, /^[0-9a-f]{64}$/, `${dir}: invalid sha256 format for ${entry}`);

      if (entry.includes("://")) {
        assert.equal(
          expectedHash,
          "e8aac17728b17fec38a1890649d8cc05a1f7e6192f6b92e9f8b6dd4ad5f81977",
          "Pinned @frihet/mcp-server@2.0.2 tarball sha256 must match npm artifact"
        );
      } else {
        const localFile = path.join(dir, entry);
        assert.ok(fs.existsSync(localFile), `Missing local source file: ${localFile}`);
        assert.equal(sha256File(localFile), expectedHash, `Hash drift on ${localFile}`);
      }
    }
  }
});

test("3. Omarchy Quattro manifest, QML Text safety gates, and clean text scan", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "manifest.json"), "utf8"));

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.id, "io.frihet.erp");
  assert.deepEqual(manifest.kinds, ["bar-widget"]);
  assert.equal(manifest.entryPoints.barWidget, "BarWidget.qml");

  for (const relPath of Object.values(manifest.entryPoints)) {
    assert.ok(!relPath.includes(".."), `Parent traversal forbidden in entryPoints: ${relPath}`);
    assert.ok(!path.isAbsolute(relPath), `Absolute path forbidden in entryPoints: ${relPath}`);
    assert.ok(fs.existsSync(path.join(REPO_ROOT, relPath)), `Entrypoint missing: ${relPath}`);
  }

  const barQml = fs.readFileSync(path.join(REPO_ROOT, "BarWidget.qml"), "utf8");
  const panelQml = fs.readFileSync(path.join(REPO_ROOT, "Panel.qml"), "utf8");

  assert.match(barQml, /moduleName:\s*"io\.frihet\.erp"/);
  assert.match(panelQml, /moduleName:\s*"io\.frihet\.erp"/);
  assert.match(panelQml, /^pragma ComponentBehavior:\s*Bound/m);

  for (const [name, qml] of [["BarWidget.qml", barQml], ["Panel.qml", panelQml]]) {
    const blocks = extractQmlTextBlocks(qml);
    for (const block of blocks) {
      assert.match(block, /textFormat:\s*Text\.PlainText/, `${name}: Text block missing PlainText:\n${block}`);
      assert.ok(
        /\belide:\s*Text\.|\bwrapMode:\s*Text\./.test(block),
        `${name}: Text block missing elide or wrapMode:\n${block}`
      );
      assert.ok(
        /\bwidth:\s*|\bLayout\.fillWidth:\s*true|\bLayout\.preferredWidth:\s*/.test(block),
        `${name}: Text block missing bounded width:\n${block}`
      );
    }
  }

  const forbiddenLegacyRoutes = [
    "/summaries" + "/monthly",
    "/summaries" + "/quarterly",
    "/taxes" + "/quarterly"
  ];
  const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf]/;

  for (const filePath of walkFiles(REPO_ROOT)) {
    if (filePath.endsWith(".png")) continue;
    const text = fs.readFileSync(filePath, "utf8");
    assert.ok(!cjkRegex.test(text), `CJK character detected in ${filePath}`);
    assert.ok(!text.includes("\u2014"), `Em dash forbidden in ${filePath}`);
    for (const badRoute of forbiddenLegacyRoutes) {
      assert.ok(!text.includes(badRoute), `Legacy non-canonical route ${badRoute} in ${filePath}`);
    }
  }
});

test("4. Model.js safety, formatting, multi-currency, and fail-closed invariants", () => {
  const dirty = "<script>alert(1)</script><img src=x onerror=y>\x00  Hello   World \n";
  const cleaned = Model.clean(dirty, 32);
  assert.ok(!cleaned.includes("<") && !cleaned.includes(">"));
  assert.ok(!cleaned.includes("\x00"));
  assert.equal(cleaned, "scriptalert(1)/scriptimg src=x o");

  assert.equal(Model.formatMoney(null, "EUR"), "N/A");
  assert.equal(Model.formatMoney(undefined, "EUR"), "N/A");
  assert.equal(Model.formatMoney(Number.NaN, "EUR"), "N/A");
  assert.equal(Model.formatMoney(1234.5, "eur"), "1234.50 EUR");
  assert.equal(Model.formatMoney(100, "EUR", true), "MIXED");

  assert.equal(Model.barLabel(null, true, false, ""), "Frihet ...");
  assert.equal(Model.barLabel({ loading: false, configured: false }, true, false, ""), "Frihet [setup]");
  assert.equal(Model.barLabel({ loading: false, configured: true, ok: false }, true, false, "timeout"), "Frihet !");

  const parsedMulti = Model.parsePayload(
    JSON.stringify({
      ok: true,
      workspaceName: "<b>Acme</b>",
      currency: "EUR",
      period: "2026-11",
      revenueTotal: 2500,
      expensesTotal: null,
      netProfit: 2000,
      vatPayable: 525,
      counts: { paid: 2, sent: 1, overdue: 2, draft: 1 },
      recentInvoices: [
        { id: "inv_1", number: "F-01", clientName: "Cliente <Uno>", status: "overdue", amount: 1000, currency: "EUR" },
        { id: "inv_2", number: "F-02", clientName: "Client Dos", status: "sent", amount: 1500, currency: "USD" }
      ],
      totalInvoicesCount: 12
    })
  );

  assert.equal(parsedMulti.ok, true);
  assert.equal(parsedMulti.state.workspaceName, "bAcme/b");
  assert.equal(parsedMulti.state.mixedCurrency, true);
  assert.equal(parsedMulti.state.partialSample, true);
  assert.equal(parsedMulti.state.expensesTotal, null);
  assert.equal(Model.formatMoney(parsedMulti.state.expensesTotal, "EUR", false), "N/A");
  assert.equal(Model.barLabel(parsedMulti.state, true, false, ""), "Frihet MIXED [2!]");

  const oversized = "x".repeat(Model.MAX_PAYLOAD_BYTES + 1);
  assert.equal(Model.parsePayload(oversized).ok, false);
  assert.equal(Model.parsePayload("{not-json").ok, false);
});

test("5. Live local HTTP mock integration for frihet-omarchy-fetch, frihet-omarchy-setup, and frihet-cli", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "frihet-omarchy-test-"));
  const requests = [];
  let mode = "ok";
  const secretKey = "fri_test_secret_99887766";

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: rawBody ? JSON.parse(rawBody) : null
      });

      if (mode === "redirect") {
        res.writeHead(302, { Location: "https://evil.example/steal" });
        res.end();
        return;
      }

      if (mode === "unauthorized") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: `Rejected token ${secretKey}` }));
        return;
      }

      if (req.url === "/v1/context" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: { workspaceName: "Test SL", currency: "EUR" } }));
        return;
      }

      if (req.url?.startsWith("/v1/monthly") && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: {
              period: "2026-11",
              currency: "EUR",
              revenue: { total: 4200 },
              expenses: { total: 1000 },
              profit: { net: 3200 },
              taxLiability: { vatPayable: 672 },
              invoices: { created: 4, sent: 1, paid: 2, overdue: 1, draft: 0 }
            }
          })
        );
        return;
      }

      if (req.url?.startsWith("/v1/quarterly") && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: {
              quarter: "2026-Q4",
              currency: "EUR",
              modelo303: { resultado: 1500 },
              modelo130: { pagoFraccionado: 900 }
            }
          })
        );
        return;
      }

      if (req.url?.startsWith("/v1/invoices") && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            total: 9,
            data: [
              { id: "inv_1", invoiceNumber: "F-2026-01", clientName: "Acme Corp", status: "overdue", total: 1200, currency: "EUR" },
              { id: "inv_2", invoiceNumber: "F-2026-02", clientName: "Beta SL", status: "paid", total: 3000, currency: "EUR" }
            ]
          })
        );
        return;
      }

      if (req.url === "/v1/invoices" && req.method === "POST") {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: { id: "inv_draft_101", status: "draft" } }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}/v1`;

  try {
    const missingEnvFile = path.join(tempDir, "nonexistent-env");
    const unconfRes = await execFileAsync("node", [FETCH_BIN], {
      env: {
        ...process.env,
        FRIHET_API_KEY: "",
        FRIHET_CONFIG_ENV: missingEnvFile
      }
    });
    const unconfJson = JSON.parse(unconfRes.stdout);
    assert.equal(unconfJson.ok, false);
    assert.equal(unconfJson.errorCode, "missing_api_key");

    const envFile = path.join(tempDir, "config", "frihet", "env");
    const claudeFile = path.join(tempDir, ".claude.json");
    const opencodeFile = path.join(tempDir, "opencode", "opencode.json");
    fs.writeFileSync(claudeFile, JSON.stringify({ mcpServers: { existing: { command: "other" } } }), "utf8");

    const setupResult = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          SETUP_BIN,
          "--api-key-stdin",
          "--api-url",
          baseUrl,
          "--config-env",
          envFile,
          "--claude-config",
          claudeFile,
          "--opencode-config",
          opencodeFile
        ],
        {
          env: {
            ...process.env,
            FRIHET_ALLOW_LOOPBACK_TEST: "1"
          }
        },
        (error, stdout, stderr) => {
          if (error) reject(Object.assign(error, { stdout, stderr }));
          else resolve({ stdout, stderr });
        }
      );
      child.stdin.end(`${secretKey}\n`);
    });

    assert.ok(!setupResult.stdout.includes(secretKey), "Setup stdout must mask API key");
    assert.ok(!setupResult.stderr.includes(secretKey), "Setup stderr must mask API key");
    assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(claudeFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(opencodeFile).mode & 0o777, 0o600);

    const claudeCfg = JSON.parse(fs.readFileSync(claudeFile, "utf8"));
    assert.equal(claudeCfg.mcpServers.existing.command, "other");
    assert.equal(claudeCfg.mcpServers.frihet.command, "frihet-mcp");
    assert.equal(claudeCfg.mcpServers.frihet.env.FRIHET_API_KEY, secretKey);

    const opencodeCfg = JSON.parse(fs.readFileSync(opencodeFile, "utf8"));
    assert.deepEqual(opencodeCfg.mcp.frihet.command, ["frihet-mcp"]);
    assert.equal(opencodeCfg.mcp.frihet.enabled, true);

    const fetchRes = await execFileAsync("node", [FETCH_BIN], {
      env: {
        ...process.env,
        FRIHET_API_KEY: "",
        FRIHET_API_URL: "",
        FRIHET_CONFIG_ENV: envFile,
        FRIHET_ALLOW_LOOPBACK_TEST: "1"
      }
    });
    const fetchJson = JSON.parse(fetchRes.stdout);
    assert.equal(fetchJson.ok, true);
    assert.equal(fetchJson.workspaceName, "Test SL");
    assert.equal(fetchJson.revenueTotal, 4200);
    assert.equal(fetchJson.counts.overdue, 1);
    assert.equal(fetchJson.totalInvoicesCount, 9);
    assert.equal(Model.parsePayload(fetchRes.stdout).state.partialSample, true);

    mode = "unauthorized";
    const unauthRes = await execFileAsync("node", [FETCH_BIN], {
      env: {
        ...process.env,
        FRIHET_CONFIG_ENV: envFile,
        FRIHET_ALLOW_LOOPBACK_TEST: "1"
      }
    });
    const unauthJson = JSON.parse(unauthRes.stdout);
    assert.equal(unauthJson.ok, false);
    assert.equal(unauthJson.errorCode, "unauthorized");
    assert.ok(!unauthJson.error.includes(secretKey), "401 error leaked raw API key");
    assert.ok(unauthJson.error.includes("[REDACTED]"));

    mode = "redirect";
    const redirRes = await execFileAsync("node", [FETCH_BIN], {
      env: {
        ...process.env,
        FRIHET_CONFIG_ENV: envFile,
        FRIHET_ALLOW_LOOPBACK_TEST: "1"
      }
    });
    const redirJson = JSON.parse(redirRes.stdout);
    assert.equal(redirJson.ok, false);
    assert.equal(redirJson.errorCode, "redirect_blocked");

    mode = "ok";
    const ssrfRes = await execFileAsync("node", [FETCH_BIN], {
      env: {
        ...process.env,
        FRIHET_API_KEY: secretKey,
        FRIHET_API_URL: "https://evil.example/v1",
        FRIHET_ALLOW_LOOPBACK_TEST: "1"
      }
    });
    const ssrfJson = JSON.parse(ssrfRes.stdout);
    assert.equal(ssrfJson.ok, false);
    assert.equal(ssrfJson.errorCode, "untrusted_base_url");

    const cliEnv = {
      ...process.env,
      FRIHET_API_KEY: "",
      FRIHET_API_URL: "",
      FRIHET_CONFIG_ENV: envFile,
      FRIHET_ALLOW_LOOPBACK_TEST: "1"
    };

    const statusOut = JSON.parse((await execFileAsync("node", [CLI_BIN, "status", "--json"], { env: cliEnv })).stdout);
    assert.equal(statusOut.context.workspaceName, "Test SL");

    const monthlyOut = JSON.parse((await execFileAsync("node", [CLI_BIN, "monthly", "2026-11", "--json"], { env: cliEnv })).stdout);
    assert.equal(monthlyOut.revenue.total, 4200);

    const quarterlyOut = JSON.parse((await execFileAsync("node", [CLI_BIN, "quarterly", "2026-Q4", "--json"], { env: cliEnv })).stdout);
    assert.equal(quarterlyOut.modelo303.resultado, 1500);

    const draftOut = JSON.parse(
      (
        await execFileAsync(
          "node",
          [
            CLI_BIN,
            "draft-invoice",
            "--client-id",
            "cli_42",
            "--description",
            "Advisory Q4",
            "--qty",
            "2",
            "--unit-price",
            "500",
            "--tax-rate",
            "21",
            "--currency",
            "EUR",
            "--json"
          ],
          { env: cliEnv }
        )
      ).stdout
    );
    assert.equal(draftOut.status, "draft");
    assert.equal(draftOut.id, "inv_draft_101");
    assert.match(draftOut.idempotencyKey, /^idemp_/);

    const postReq = requests.find((r) => r.method === "POST" && r.url === "/v1/invoices");
    assert.ok(postReq, "Expected POST /v1/invoices");
    assert.equal(postReq.body.status, "draft");
    assert.match(String(postReq.headers["idempotency-key"]), /^idemp_/);

    await assert.rejects(
      execFileAsync(
        "node",
        [
          CLI_BIN,
          "draft-invoice",
          "--client-id",
          "cli_42",
          "--description",
          "Blocked",
          "--qty",
          "1",
          "--unit-price",
          "100",
          "--status",
          "sent"
        ],
        { env: cliEnv }
      ),
      /non-draft status/
    );
  } finally {
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
