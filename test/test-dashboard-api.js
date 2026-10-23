// Dashboard API smoke tests: the new Quality page and Evidence endpoints must
// return JSON even when there is no feature data to show.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { once } = require("events");
const { initProject, cleanup, TEST_ENV } = require("./helpers/sandbox");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function get(port, route) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { hostname: "127.0.0.1", port, path: route, timeout: 10000 },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve({ status: response.statusCode, body }));
      }
    );

    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", reject);
  });
}

async function waitForServer(port) {
  let lastError;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await get(port, "/api/health");
      if (response.status === 200) return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw lastError || new Error("dashboard did not start");
}

function post(port, route, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: route,
        method: "POST",
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () =>
          resolve({ status: response.statusCode, body: responseBody })
        );
      }
    );

    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", reject);
    request.end(body);
  });
}

test("dashboard quality and evidence APIs return structured data", async () => {
  const root = initProject({ prefix: "sdrive-dash-api-" });
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(root, ".sdrive", "dashboard", "server.js")], {
    cwd: root,
    env: { ...TEST_ENV, SDRIVE_PORT: String(port) },
    stdio: "ignore"
  });

  try {
    await waitForServer(port);

    const validation = JSON.parse((await get(port, "/api/validate")).body);
    assert.strictEqual(validation.ok, true);
    assert.ok(Array.isArray(validation.results));

    const migrations = JSON.parse((await get(port, "/api/migrations")).body);
    assert.ok(Array.isArray(migrations.detections));
    assert.ok(Array.isArray(migrations.runs));

    const evidence = JSON.parse((await get(port, "/api/test-evidence/demo/v1")).body);
    assert.strictEqual(evidence.found, false);

    const review = JSON.parse((await get(port, "/api/review/demo/v1")).body);
    assert.strictEqual(review.found, false);

    const archive = JSON.parse((await get(port, "/api/archive-check/demo")).body);
    assert.ok(Array.isArray(archive.blockers));

    const projects = JSON.parse((await get(port, "/api/projects")).body);
    assert.ok(Array.isArray(projects.projects));
    assert.ok(projects.projects.some((project) => project.active));

    const rejected = await post(port, "/api/switch-project", {
      path: path.join(root, "not-a-project")
    });
    assert.strictEqual(rejected.status, 400);
    assert.strictEqual(JSON.parse(rejected.body).ok, false);

    const quality = await get(port, "/quality");
    assert.strictEqual(quality.status, 200);
  } finally {
    server.kill("SIGTERM");

    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);

    cleanup(root);
  }
});

test("product backlog maps columns and derives dependency waves", async () => {
  const root = initProject({ prefix: "sdrive-dash-backlog-" });
  const productDir = path.join(root, ".sdrive", "product");
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(
    path.join(productDir, "backlog.md"),
    [
      "# Product Backlog",
      "",
      "## Summary",
      "",
      "| Milestone | Items | Count |",
      "|---|---|---|",
      "| M0 - Foundation | BP-001 to BP-003 | 3 |",
      "| **Total** |  | 3 |",
      "",
      "## Status legend",
      "",
      "| Status | Meaning |",
      "|---|---|",
      "| `backlog` | Approved candidate |",
      "",
      "## M0 - Foundation",
      "",
      "| ID | Feature | Details | User value | Priority | Depends on | Status | Confidence / source |",
      "|---|---|---|---|---|---|---|---|",
      "| BP-001 | Parser core | Parse YAML and JSON files. | Parse files | P0 | - | backlog | High |",
      "| BP-002 | Retry layer | Retry failed calls with backoff. | Retry calls | P1 | BP-001 | backlog | High |",
      "| BP-003 | Partner adapter | Call the partner API. | Call partner | P1 | BP-001; partner access | backlog | Low |",
      "",
      "## M1 - Publish",
      "",
      "| ID | Feature | User value | Priority | Depends on | Status | Confidence / source |",
      "|---|---|---|---|---|---|---|",
      "| BP-004 | Release bundle | Ship both | P1 | BP-002 to BP-003 | backlog | High |",
      "",
      "## Legacy",
      "",
      "| ID | Feature | Milestone | Priority | Dependencies | Status |",
      "|---|---|---|---|---|---|",
      "| BP-005 | Legacy item | M2 - Legacy | P2 | BP-004 | backlog |",
      ""
    ].join("\n")
  );

  const port = await freePort();
  const server = spawn(process.execPath, [path.join(root, ".sdrive", "dashboard", "server.js")], {
    cwd: root,
    env: { ...TEST_ENV, SDRIVE_PORT: String(port) },
    stdio: "ignore"
  });

  try {
    await waitForServer(port);

    const product = JSON.parse((await get(port, "/api/product")).body);
    const backlog = product.backlog;

    // Lifecycle is dynamic and wave-ordered; the UI pages this at 20 per page.
    assert.deepStrictEqual(product.counts, { backlog: 5, ongoing: 0, completed: 0 });
    assert.deepStrictEqual(
      product.waves.map((wave) => [wave.label, wave.total, wave.eligible]),
      [
        ["start", 1, 1],
        ["W1", 2, 0],
        ["W2", 1, 0],
        ["W3", 1, 0]
      ]
    );

    // Summary and legend tables are documentation, not candidates. The old
    // positional parser counted them and pushed user value into Milestone.
    assert.strictEqual(backlog.length, 5);
    assert.ok(backlog.every((item) => /^BP-\d{3}$/.test(item.id)));

    const byId = new Map(backlog.map((item) => [item.id, item]));

    assert.strictEqual(byId.get("BP-001").milestone, "M0 - Foundation");
    assert.strictEqual(byId.get("BP-001").userValue, "Parse files");
    assert.strictEqual(byId.get("BP-001").details, "Parse YAML and JSON files.");
    assert.strictEqual(byId.get("BP-003").userValue, "Call partner");

    // Feature dependencies and external prerequisites are separated.
    assert.deepStrictEqual(byId.get("BP-003").dependsOn, ["BP-001"]);
    assert.deepStrictEqual(byId.get("BP-003").externalDependencies, ["partner access"]);
    assert.deepStrictEqual(byId.get("BP-004").dependsOn, ["BP-002", "BP-003"]);

    // The inverse edge is what the table calls "Base for".
    assert.deepStrictEqual(byId.get("BP-001").baseFor, ["BP-002", "BP-003"]);
    assert.deepStrictEqual(byId.get("BP-003").baseFor, ["BP-004"]);

    // Wave is dependency depth, so equal waves cannot depend on each other.
    assert.strictEqual(byId.get("BP-001").wave, 0);
    assert.strictEqual(byId.get("BP-002").wave, 1);
    assert.strictEqual(byId.get("BP-003").wave, 1);
    assert.strictEqual(byId.get("BP-004").wave, 2);
    assert.strictEqual(byId.get("BP-005").wave, 3);
    assert.deepStrictEqual(byId.get("BP-002").parallelWith, ["BP-003"]);

    // The older six-column table still works, and its Milestone column wins
    // over the section heading.
    assert.strictEqual(byId.get("BP-005").milestone, "M2 - Legacy");
    assert.deepStrictEqual(byId.get("BP-005").dependsOn, ["BP-004"]);

    // Every row carries the lifecycle fields the Product Plan filters on.
    assert.ok(backlog.every((item) => item.lifecycleStatus === "backlog"));
    assert.strictEqual(byId.get("BP-001").eligible, true);
    assert.strictEqual(byId.get("BP-002").eligible, false);
    assert.deepStrictEqual(byId.get("BP-002").blockedBy, ["BP-001"]);
    assert.strictEqual(byId.get("BP-003").eligible, false);
    assert.deepStrictEqual(byId.get("BP-004").blockedBy, ["BP-002", "BP-003"]);
  } finally {
    server.kill("SIGTERM");

    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);

    cleanup(root);
  }
});
