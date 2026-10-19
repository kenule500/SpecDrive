// Dashboard API smoke tests: the new Quality page and Evidence endpoints must
// return JSON even when there is no feature data to show.
const test = require("node:test");
const assert = require("node:assert");
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
