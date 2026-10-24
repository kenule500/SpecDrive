// End-to-end tests for the dashboard's project switcher.
//
// One dashboard process must be able to move between projects without
// restarting: /api/switch-project repoints every subsequent API call at the
// new project. Two sibling projects are built under one temp parent so
// discovery has a controlled list and the "only offered paths" rule can be
// checked against a directory that exists but is not a SpecDrive project.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { once } = require("events");
const { createProject, runCli, seedTeam, writeJson, cleanup, TEST_ENV } = require("./helpers/sandbox");

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

function request(port, route, options = {}) {
  const { method = "GET", payload } = options;
  const body = payload === undefined ? null : JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: route,
        method,
        timeout: 10000,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body)
            }
          : {}
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(responseBody);
          } catch (error) {
            // Some routes serve HTML; leave json null for those.
          }
          resolve({ status: response.statusCode, body: responseBody, json });
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

async function waitForServer(port) {
  let lastError;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await request(port, "/api/health");
      if (response.status === 200) return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw lastError || new Error("dashboard did not start");
}

function initAt(dir) {
  const result = runCli(["init", "--tools", "none", "--no-dashboard"], { cwd: dir });
  if (result.status !== 0) {
    throw new Error(
      `sdrive init failed in ${dir} (${result.status}):\n${result.stdout || ""}\n${result.stderr || ""}`
    );
  }
}

function canonicalPath(value) {
  const resolved = path.resolve(value);

  try {
    return fs.realpathSync.native(resolved);
  } catch (error) {
    return resolved;
  }
}

function samePath(a, b) {
  const left = canonicalPath(a);
  const right = canonicalPath(b);

  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function assertSamePath(actual, expected, message) {
  assert.ok(samePath(actual, expected), message || `${actual} !== ${expected}`);
}

test("dashboard switches between projects without a restart", async () => {
  const parent = createProject("sdrive-switch-");
  const alpha = path.join(parent, "alpha");
  const beta = path.join(parent, "beta");
  const notAProject = path.join(parent, "not-a-project");
  const home = path.join(parent, "home");
  // Lives outside alpha's parent, so it can only be reached through the
  // registry. This is the "one repo per client" layout the switcher must serve.
  const otherParent = createProject("sdrive-switch-other-");
  const gamma = path.join(otherParent, "gamma");

  for (const dir of [alpha, beta, notAProject, home, gamma]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    initAt(alpha);
    initAt(beta);
    initAt(gamma);

    seedTeam(alpha, "alpha-admin");
    seedTeam(beta, "beta-admin");
    seedTeam(gamma, "gamma-admin");

    // A live feature with one rejected gate, so the portfolio has to report a
    // real problem rather than counting a pending gate as one.
    writeJson(path.join(beta, ".sdrive", "workflow-state.json"), {
      features: [
        {
          name: "upload",
          currentVersion: "v1",
          versions: [
            {
              id: "v1",
              phase: "ongoing",
              currentStep: "implementation",
              gates: {
                specification: "approved",
                planning: "rejected",
                implementation: "pending",
                review: "pending"
              },
              history: [{ event: "review requested", timestamp: "2026-10-19T10:00:00Z" }]
            }
          ]
        }
      ]
    });

    // A project outside this tree is known only because a previous dashboard
    // recorded it. The registry is an array here, to prove the shape survives
    // an auto-registration write.
    fs.mkdirSync(path.join(home, ".sdrive"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".sdrive", "projects.json"),
      `${JSON.stringify([gamma], null, 2)}\n`
    );

    // Isolate discovery: no SDRIVE_PROJECTS, no real ~/.sdrive/projects.json.
    const env = { ...TEST_ENV, HOME: home, USERPROFILE: home };
    delete env.SDRIVE_PROJECTS;
    delete env.SDRIVE_NO_REGISTRY;

    const port = await freePort();
    const server = spawn(
      process.execPath,
      [path.join(alpha, ".sdrive", "dashboard", "server.js")],
      {
        cwd: alpha,
        env: { ...env, SDRIVE_PORT: String(port) },
        stdio: "ignore"
      }
    );

    try {
      await waitForServer(port);

      // ---- discovery -------------------------------------------------
      const initial = await request(port, "/api/projects");
      assert.strictEqual(initial.status, 200);
      assertSamePath(initial.json.active, alpha);

      const names = initial.json.projects.map((project) => project.name).sort();
      assert.deepStrictEqual(names, ["alpha", "beta", "gamma"], "siblings and registry entries are offered");

      // ---- registering on start --------------------------------------
      const registryFile = path.join(home, ".sdrive", "projects.json");
      const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
      assert.ok(Array.isArray(registry), "an array registry stays an array");
      assert.deepStrictEqual(
        registry.map(canonicalPath).sort(),
        [gamma, alpha].map(canonicalPath).sort(),
        "the served project is recorded next to the entries already there"
      );

      const initialAlpha = initial.json.projects.find((project) => project.active);
      assert.strictEqual(initialAlpha.name, "alpha");
      assert.strictEqual(initialAlpha.label, "alpha");

      // ---- portfolio -------------------------------------------------
      const portfolio = await request(port, "/api/portfolio");
      assert.strictEqual(portfolio.status, 200);
      assertSamePath(portfolio.json.active, alpha);

      const byName = new Map(portfolio.json.projects.map((project) => [project.name, project]));
      assert.deepStrictEqual(
        [...byName.keys()].sort(),
        ["alpha", "beta", "gamma"],
        "the portfolio covers every offered project"
      );

      const alphaCard = byName.get("alpha");
      assert.strictEqual(alphaCard.status, "idle");
      assert.strictEqual(alphaCard.features, 0);
      assert.strictEqual(alphaCard.live, 0);
      assert.strictEqual(alphaCard.focus, null);

      const betaCard = byName.get("beta");
      assert.strictEqual(betaCard.features, 1);
      assert.strictEqual(betaCard.live, 1);
      assert.strictEqual(betaCard.status, "blocked", "a rejected gate is a blocker");
      assert.strictEqual(betaCard.focus.feature, "upload");
      assert.strictEqual(betaCard.focus.step, "implementation");
      assert.strictEqual(betaCard.focus.approvedGates, 1);
      assert.strictEqual(betaCard.focus.totalGates, 4);
      assert.deepStrictEqual(betaCard.rejectedGates, ["planning"]);
      assert.deepStrictEqual(
        betaCard.outstandingGates,
        ["planning", "implementation", "review"],
        "pending gates are the next step, listed separately"
      );
      assert.strictEqual(betaCard.lastActivity, "2026-10-19T10:00:00.000Z");

      const projectsPage = await request(port, "/projects");
      assert.strictEqual(projectsPage.status, 200);
      assert.match(projectsPage.body, /id="projects-grid"/);

      // ---- every API reads the active project ------------------------
      assert.strictEqual((await request(port, "/api/project-info")).json.name, "alpha");
      assert.deepStrictEqual(
        (await request(port, "/api/team")).json.members.map((member) => member.username),
        ["alpha-admin"]
      );

      // ---- switch ----------------------------------------------------
      const switched = await request(port, "/api/switch-project", {
        method: "POST",
        payload: { path: beta }
      });
      assert.strictEqual(switched.status, 200);
      assert.strictEqual(switched.json.ok, true);
      assert.strictEqual(switched.json.project, "beta");

      assert.strictEqual((await request(port, "/api/project-info")).json.name, "beta");
      assertSamePath((await request(port, "/api/project-info")).json.root, beta);

      // The portfolio answers from the previous project unless the switch
      // clears it; the active flag is the cheap proof that it did.
      const switchedPortfolio = await request(port, "/api/portfolio");
      assertSamePath(switchedPortfolio.json.active, beta);
      assert.strictEqual(
        switchedPortfolio.json.projects.find((project) => project.name === "beta").active,
        true
      );
      assert.strictEqual(
        switchedPortfolio.json.projects.find((project) => project.name === "alpha").active,
        false
      );
      assert.deepStrictEqual(
        (await request(port, "/api/team")).json.members.map((member) => member.username),
        ["beta-admin"],
        "data follows the switch, not the launch directory"
      );

      const afterSwitch = await request(port, "/api/projects");
      assertSamePath(afterSwitch.json.active, beta);
      assert.strictEqual(afterSwitch.json.projects[0].name, "beta", "active project sorts first");
      assert.strictEqual(afterSwitch.json.projects[0].active, true);
      assert.strictEqual(
        afterSwitch.json.projects.find((project) => project.name === "alpha").active,
        false
      );

      // ---- switch to a project from another tree --------------------
      const far = await request(port, "/api/switch-project", {
        method: "POST",
        payload: { path: gamma }
      });
      assert.strictEqual(far.status, 200);
      assert.strictEqual((await request(port, "/api/project-info")).json.name, path.basename(gamma));
      assert.deepStrictEqual(
        (await request(port, "/api/team")).json.members.map((member) => member.username),
        ["gamma-admin"]
      );

      // ---- switch back ----------------------------------------------
      const back = await request(port, "/api/switch-project", {
        method: "POST",
        payload: { path: alpha }
      });
      assert.strictEqual(back.status, 200);
      assert.deepStrictEqual(
        (await request(port, "/api/team")).json.members.map((member) => member.username),
        ["alpha-admin"]
      );

      // Switches did not duplicate or reshape the registry: alpha was already
      // there, beta joined when it became active, gamma was preserved.
      const settled = JSON.parse(fs.readFileSync(registryFile, "utf8"));
      assert.ok(Array.isArray(settled));
      assert.deepStrictEqual(
        settled.map(canonicalPath).sort(),
        [alpha, beta, gamma].map(canonicalPath).sort()
      );

      // ---- refusals --------------------------------------------------
      const outside = await request(port, "/api/switch-project", {
        method: "POST",
        payload: { path: notAProject }
      });
      assert.strictEqual(outside.status, 400, "a directory that is not a project is refused");
      assert.strictEqual(outside.json.ok, false);
      assert.match(outside.json.error, /project list/i);

      const traversal = await request(port, "/api/switch-project", {
        method: "POST",
        payload: { path: path.join(parent, "..", "somewhere-else") }
      });
      assert.strictEqual(traversal.status, 400, "an arbitrary path is refused");

      const missing = await request(port, "/api/switch-project", {
        method: "POST",
        payload: {}
      });
      assert.strictEqual(missing.status, 400);
      assert.match(missing.json.error, /path is required/i);

      const wrongMethod = await request(port, "/api/switch-project");
      assert.strictEqual(wrongMethod.status, 405);

      // A refused switch must not move the dashboard.
      assert.strictEqual((await request(port, "/api/project-info")).json.name, "alpha");
    } finally {
      server.kill("SIGTERM");
      await Promise.race([
        once(server, "exit"),
        new Promise((resolve) => setTimeout(resolve, 3000))
      ]);
    }
  } finally {
    cleanup(parent);
    cleanup(otherParent);
  }
});

test("sdrive dashboard reuses a running dashboard instead of adding a port", async () => {
  const parent = createProject("sdrive-reuse-");
  const one = path.join(parent, "one");
  const two = path.join(parent, "two");

  for (const dir of [one, two]) {
    fs.mkdirSync(dir, { recursive: true });
    initAt(dir);
  }

  const port = await freePort();
  const env = { ...TEST_ENV };
  delete env.SDRIVE_NO_REUSE;
  delete env.SDRIVE_PROJECTS;

  const server = spawn(
    process.execPath,
    [path.join(one, ".sdrive", "dashboard", "server.js")],
    { cwd: one, env: { ...env, SDRIVE_PORT: String(port) }, stdio: "ignore" }
  );

  try {
    await waitForServer(port);
    assert.strictEqual((await request(port, "/api/project-info")).json.name, "one");

    // `sdrive dashboard` from the second project must hand that project to the
    // server that is already running, not start another one.
    const cli = runCli(["dashboard"], {
      cwd: two,
      env: { ...env, SDRIVE_PORT: String(port) },
      timeout: 30000
    });

    assert.strictEqual(cli.status, 0, cli.stderr || cli.stdout);
    assert.match(cli.stdout, /already running/i);
    assert.doesNotMatch(cli.stdout, /Starting the SpecDrive dashboard/);

    assert.strictEqual((await request(port, "/api/project-info")).json.name, "two");

    // It is the same server: still one listener, one port.
    const projects = await request(port, "/api/projects");
    assertSamePath(projects.json.active, two);
  } finally {
    server.kill("SIGTERM");
    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
    cleanup(parent);
  }
});

test("dashboards started together share one project list", async () => {
  const parent = createProject("sdrive-registry-");
  const home = path.join(parent, "home");
  const names = ["one", "two", "three", "four"];
  const projects = names.map((name) => path.join(parent, name));

  fs.mkdirSync(home, { recursive: true });

  try {
    for (const dir of projects) {
      fs.mkdirSync(dir, { recursive: true });
      initAt(dir);
    }

    const env = { ...TEST_ENV, HOME: home, USERPROFILE: home };
    delete env.SDRIVE_NO_REGISTRY;
    delete env.SDRIVE_PROJECTS;

    const base = await freePort();
    const servers = projects.map((dir, index) =>
      spawn(
        process.execPath,
        [path.join(dir, ".sdrive", "dashboard", "server.js")],
        {
          cwd: dir,
          env: { ...env, SDRIVE_PORT: String(base + index) },
          stdio: "ignore"
        }
      )
    );

    try {
      await Promise.all(servers.map((server, index) => waitForServer(base + index)));

      // Registration happens at listen, so these four writes overlap. None of
      // them may erase another project from the shared list.
      const registry = JSON.parse(
        fs.readFileSync(path.join(home, ".sdrive", "projects.json"), "utf8")
      );
      const recorded = (Array.isArray(registry) ? registry : registry.projects).map(
        canonicalPath
      );

      for (const dir of projects) {
        assert.ok(
          recorded.some((entry) => samePath(entry, dir)),
          `${path.basename(dir)} survived the concurrent writes`
        );
      }
    } finally {
      for (const server of servers) server.kill("SIGTERM");
      await Promise.all(
        servers.map((server) =>
          Promise.race([
            once(server, "exit"),
            new Promise((resolve) => setTimeout(resolve, 3000))
          ])
        )
      );
    }
  } finally {
    cleanup(parent);
  }
});
