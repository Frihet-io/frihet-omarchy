import assert from "node:assert/strict";
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

test("1. Omarchy Quattro manifest, QML security gates, no StdioCollector/sh -c, and clean text scan", () => {
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

  assert.ok(!barQml.includes("StdioCollector"), "StdioCollector is forbidden; use bounded SplitParser");
  assert.ok(!panelQml.includes("StdioCollector"), "StdioCollector is forbidden; use bounded SplitParser");
  assert.ok(!/"(?:ba)?sh"\s*,\s*"-l?c"/.test(barQml), "Shell command strings forbidden in BarWidget.qml");
  assert.ok(!/"(?:ba)?sh"\s*,\s*"-l?c"/.test(panelQml), "Shell command strings forbidden in Panel.qml");

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

  const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
  assert.match(readme, /omarchy plugin remove io\.frihet\.erp/, "README must document exact plugin removal command");

  const forbiddenLegacyRoutes = [
    "/summaries" + "/monthly",
    "/summaries" + "/quarterly",
    "/taxes" + "/quarterly"
  ];
  const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf]/;

  for (const filePath of walkFiles(REPO_ROOT)) {
    if (filePath.endsWith(".png") || filePath.endsWith(".webp")) continue;
    const text = fs.readFileSync(filePath, "utf8");
    assert.ok(!cjkRegex.test(text), `CJK character detected in ${filePath}`);
    assert.ok(!text.includes("\u2014"), `Em dash forbidden in ${filePath}`);
    for (const badRoute of forbiddenLegacyRoutes) {
      assert.ok(!text.includes(badRoute), `Legacy non-canonical route ${badRoute} in ${filePath}`);
    }
  }
});

test("2. Model.js safety (< > & bidi strip), null-prototype currency map, and fail-closed invariants", () => {
  const dirty = "<script>alert(1)&x</script><img src=x>\x00\u202E  Hello & World \n";
  const cleaned = Model.clean(dirty, 40);
  assert.ok(!cleaned.includes("<") && !cleaned.includes(">") && !cleaned.includes("&"));
  assert.ok(!cleaned.includes("\x00") && !cleaned.includes("\u202E"));
  assert.equal(cleaned, "scriptalert(1)x/scriptimg src=x Hello Wo");

  assert.equal(Model.formatMoney(null, "EUR"), "N/A");
  assert.equal(Model.formatMoney(undefined, "EUR"), "N/A");
  assert.equal(Model.formatMoney(Number.NaN, "EUR"), "N/A");
  assert.equal(Model.formatMoney(1234.5, "eur"), "1234.50 EUR");
  assert.equal(Model.formatMoney(100, "EUR", true), "MIXED");

  assert.equal(Model.barLabel(null, true, false, ""), "Frihet ...");
  assert.equal(Model.barLabel({ loading: false, configured: false }, true, false, ""), "Frihet [key]");
  assert.equal(Model.barLabel({ loading: false, configured: true, ok: false }, true, false, "timeout"), "Frihet !");

  const parsedProto = Model.parsePayload(
    JSON.stringify({
      ok: true,
      workspaceName: "<b>Acme & Co</b>",
      currency: "__proto__",
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

  assert.equal(parsedProto.ok, true);
  assert.equal(parsedProto.state.workspaceName, "bAcme Co/b");
  assert.equal(parsedProto.state.mixedCurrency, true);
  assert.equal(parsedProto.state.partialSample, true);
  assert.equal(parsedProto.state.expensesTotal, null);
  assert.equal(Model.formatMoney(parsedProto.state.expensesTotal, "EUR", false), "N/A");
  assert.equal(Model.barLabel(parsedProto.state, true, false, ""), "Frihet MIXED [2!]");

  const oversized = "x".repeat(Model.MAX_PAYLOAD_BYTES + 1);
  assert.equal(Model.parsePayload(oversized).ok, false);
  assert.equal(Model.parsePayload("{not-json").ok, false);
});

test("3. Descriptor-bound credential file protection (0600 enforcement & symlink refusal)", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "frihet-fd-test-"));
  try {
    // Missing ~/.config/frihet/env -> missing_api_key
    const missingRes = await execFileAsync("python3", ["-I", FETCH_BIN], {
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        FRIHET_ALLOW_LOOPBACK_TEST: "1",
        FRIHET_TEST_HOME: tempHome
      }
    });
    const missingJson = JSON.parse(missingRes.stdout);
    assert.equal(missingJson.ok, false);
    assert.equal(missingJson.errorCode, "missing_api_key");

    // World-readable 0644 env file -> refused with unsafe_credentials_file
    const frihetDir = path.join(tempHome, ".config", "frihet");
    fs.mkdirSync(frihetDir, { recursive: true, mode: 0o700 });
    const envPath = path.join(frihetDir, "env");
    fs.writeFileSync(envPath, "FRIHET_API_KEY=fri_test_secret_99887766\n", { mode: 0o644 });
    fs.chmodSync(envPath, 0o644);

    const openPermRes = await execFileAsync("python3", ["-I", FETCH_BIN], {
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        FRIHET_ALLOW_LOOPBACK_TEST: "1",
        FRIHET_TEST_HOME: tempHome
      }
    });
    const openPermJson = JSON.parse(openPermRes.stdout);
    assert.equal(openPermJson.ok, false);
    assert.equal(openPermJson.errorCode, "unsafe_credentials_file");

    // Planted symlink at ~/.config/frihet/env -> refused via O_NOFOLLOW
    fs.unlinkSync(envPath);
    const targetSecret = path.join(tempHome, "other-secret");
    fs.writeFileSync(targetSecret, "FRIHET_API_KEY=fri_test_secret_99887766\n", { mode: 0o600 });
    fs.symlinkSync(targetSecret, envPath);

    const symlinkRes = await execFileAsync("python3", ["-I", FETCH_BIN], {
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        FRIHET_ALLOW_LOOPBACK_TEST: "1",
        FRIHET_TEST_HOME: tempHome
      }
    });
    const symlinkJson = JSON.parse(symlinkRes.stdout);
    assert.equal(symlinkJson.ok, false);
    assert.equal(symlinkJson.errorCode, "unsafe_credentials_file");
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("4. Live local HTTP mock integration for frihet-omarchy-fetch (happy path, 401 redaction, 302 block, oversize cap)", async () => {
  let mode = "ok";
  const secretKey = "fri_test_secret_99887766";

  const server = http.createServer((req, res) => {
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

    if (mode === "oversize") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("x".repeat(300000));
      return;
    }

    if (req.url === "/v1/context" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { workspaceName: "Nordic Studio SL", currency: "EUR" } }));
      return;
    }

    if (req.url?.startsWith("/v1/monthly") && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          data: {
            period: "2026-11",
            currency: "EUR",
            revenue: { total: 14850 },
            expenses: { total: 2340 },
            profit: { net: 12510 },
            taxLiability: { vatPayable: 2627.1 },
            invoices: { created: 8, sent: 2, paid: 5, overdue: 1, draft: 1 }
          }
        })
      );
      return;
    }

    if (req.url?.startsWith("/v1/invoices") && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          total: 12,
          data: [
            { id: "inv_1", invoiceNumber: "F-2026-048", clientName: "Krono Labs AB", status: "paid", total: 4800, currency: "EUR" },
            { id: "inv_2", invoiceNumber: "F-2026-047", clientName: "Vektor Digital SL", status: "overdue", total: 2450, currency: "EUR" },
            { id: "inv_3", invoiceNumber: "F-2026-046", clientName: "Alba Systems", status: "sent", total: 3600, currency: "EUR" }
          ]
        })
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = String(server.address().port);

  try {
    const baseEnv = {
      PATH: process.env.PATH || "/usr/bin:/bin",
      FRIHET_ALLOW_LOOPBACK_TEST: "1",
      FRIHET_TEST_LOOPBACK_PORT: port,
      FRIHET_TEST_API_KEY: secretKey
    };

    const okRes = await execFileAsync("python3", ["-I", FETCH_BIN], { env: baseEnv });
    const okJson = JSON.parse(okRes.stdout);
    assert.equal(okJson.ok, true);
    assert.equal(okJson.workspaceName, "Nordic Studio SL");
    assert.equal(okJson.revenueTotal, 14850);
    assert.equal(okJson.counts.overdue, 1);
    assert.equal(okJson.totalInvoicesCount, 12);
    assert.equal(Model.parsePayload(okRes.stdout).state.partialSample, true);

    mode = "unauthorized";
    const unauthRes = await execFileAsync("python3", ["-I", FETCH_BIN], { env: baseEnv });
    const unauthJson = JSON.parse(unauthRes.stdout);
    assert.equal(unauthJson.ok, false);
    assert.equal(unauthJson.errorCode, "unauthorized");
    assert.ok(!unauthJson.error.includes(secretKey), "401 error leaked raw API key");
    assert.ok(unauthJson.error.includes("[REDACTED]"));

    mode = "redirect";
    const redirRes = await execFileAsync("python3", ["-I", FETCH_BIN], { env: baseEnv });
    const redirJson = JSON.parse(redirRes.stdout);
    assert.equal(redirJson.ok, false);
    assert.equal(redirJson.errorCode, "redirect_blocked");

    mode = "oversize";
    const overRes = await execFileAsync("python3", ["-I", FETCH_BIN], { env: baseEnv });
    const overJson = JSON.parse(overRes.stdout);
    assert.equal(overJson.ok, false);
    assert.equal(overJson.errorCode, "response_too_large");
  } finally {
    server.close();
  }
});
