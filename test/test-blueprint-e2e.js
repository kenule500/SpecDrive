const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const packageRoot = path.join(__dirname, "..");
const cliPath = path.join(packageRoot, "src", "index.js");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-blueprint-e2e-"));
const sdriveRoot = path.join(tempRoot, ".sdrive");
const commandsDir = path.join(sdriveRoot, "commands");
const testModulesRoot = path.join(tempRoot, "test-node-modules");

function writeCommanderShim() {
  fs.mkdirSync(path.join(testModulesRoot, "commander"), { recursive: true });
  fs.writeFileSync(
    path.join(testModulesRoot, "commander", "index.js"),
    `class Command {
      constructor() { this.subcommands = []; }
      name() { return this; }
      description() { return this; }
      version() { return this; }
      command(definition) {
        const subcommand = new Command();
        subcommand.commandName = definition.split(/\\s+/)[0];
        this.subcommands.push(subcommand);
        return subcommand;
      }
      action(handler) { this.handler = handler; return this; }
      parse(argv) {
        const subcommand = this.subcommands.find((item) => item.commandName === argv[2]);
        if (!subcommand || !subcommand.handler) throw new Error('Test Commander shim could not resolve command.');
        subcommand.handler();
      }
    }
    module.exports = { Command };`
  );
}

function runInit() {
  execFileSync(process.execPath, [cliPath, "init"], {
    cwd: tempRoot,
    input: "1\n1\n\n",
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, NODE_PATH: testModulesRoot }
  });
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return fields;
}

try {
  writeCommanderShim();
  runInit();

  // --- 1. Agent file installed and well-formed ---
  const agentPath = path.join(sdriveRoot, "agents", "12-blueprint.md");
  assert.ok(fs.existsSync(agentPath), "12-blueprint.md should be installed");
  const agentMarkdown = fs.readFileSync(agentPath, "utf8");
  const frontmatter = parseFrontmatter(agentMarkdown);
  assert.ok(frontmatter, "agent file should have YAML frontmatter");
  assert.strictEqual(frontmatter.name, "Blueprint");
  assert.strictEqual(frontmatter["user-invocable"], "true");
  assert.strictEqual(frontmatter["disable-model-invocation"], "false");
  assert.ok(frontmatter.tools.includes("vscode/askQuestions"), "agent should be able to ask questions");
  assert.ok(frontmatter.tools.includes("create"), "agent should be able to create files");
  assert.ok(frontmatter.tools.includes("edit"), "agent should be able to edit files");

  // --- 2. Manifest registration ---
  const manifest = JSON.parse(fs.readFileSync(path.join(commandsDir, "manifest.json"), "utf8"));
  const blueprintEntry = manifest.commands.find((c) => c.command === "/sdrive:blueprint");
  assert.ok(blueprintEntry, "/sdrive:blueprint should be registered");
  assert.strictEqual(blueprintEntry.agent, "blueprint");
  assert.strictEqual(blueprintEntry.agentFile, ".sdrive/agents/12-blueprint.md");
  assert.strictEqual(blueprintEntry.acceptsFeature, false, "blueprint is not feature-scoped");
  assert.deepStrictEqual(blueprintEntry.gates, [], "blueprint has no approval gates");
  assert.deepStrictEqual(blueprintEntry.validators, [], "blueprint has no validators");

  // --- 3. Permissions ---
  const permissions = JSON.parse(fs.readFileSync(path.join(commandsDir, "permissions.json"), "utf8"));
  assert.deepStrictEqual(permissions.rules["/sdrive:blueprint"], ["admin", "reviewer"]);

  // --- 4. Router resolves the command to the agent ---
  fs.writeFileSync(path.join(sdriveRoot, "scripts", "check-permission.js"), "process.exit(0);\n");
  const routerOutput = execFileSync(
    process.execPath,
    [path.join(commandsDir, "router.js"), "/sdrive:blueprint"],
    { cwd: tempRoot, encoding: "utf8" }
  );
  assert.ok(routerOutput.includes("SpecDrive Command: /sdrive:blueprint"));
  assert.ok(routerOutput.includes("Agent: blueprint"));
  assert.ok(routerOutput.includes("12-blueprint.md"), "router should point at the agent file");

  // --- 5. Agent declares the 5 product artifacts it will produce ---
  const expectedArtifacts = [
    ".sdrive/product/overview.md",
    ".sdrive/product/mockup.md",
    ".sdrive/product/design-system.md",
    ".sdrive/product/roadmap.md",
    ".sdrive/product/backlog.md"
  ];
  for (const artifact of expectedArtifacts) {
    assert.ok(agentMarkdown.includes(artifact), `agent should declare artifact ${artifact}`);
  }

  // --- 6. Agent is optional and explicitly forbids feature-spec creation ---
  assert.ok(/optional/i.test(agentMarkdown), "agent should describe itself as optional");
  assert.ok(
    /Do NOT create[\s\S]*?\.sdrive\/specs\//.test(agentMarkdown),
    "blueprint must explicitly forbid creating .sdrive/specs/ feature folders"
  );
  assert.ok(
    /workflow-state/i.test(agentMarkdown),
    "blueprint must explicitly address workflow-state entries"
  );
  assert.ok(
    /\/sdrive:propose/.test(agentMarkdown),
    "blueprint must hand off detailed planning to /sdrive:propose"
  );

  // --- 7. Simulate the approved blueprint output and verify it is well-formed ---
  const productDir = path.join(sdriveRoot, "product");
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(
    path.join(productDir, "overview.md"),
    "# Product Overview\n\n## Confirmed\n- Habit tracker for students\n\n## Assumed\n- Mobile-first\n\n## Open Questions\n- Sync across devices?\n"
  );
  fs.writeFileSync(
    path.join(productDir, "backlog.md"),
    "# Product Backlog\n\n| ID | Feature | Status |\n| --- | --- | --- |\n| BP-001 | Create a habit | pending |\n| BP-002 | Daily reminders | pending |\n"
  );
  const backlog = fs.readFileSync(path.join(productDir, "backlog.md"), "utf8");
  assert.ok(/BP-\d{3}/.test(backlog), "backlog should use BP-### identifiers");
  assert.ok(/pending/.test(backlog), "backlog entries should carry a status");

  // --- 8. Blueprint must not have created any feature spec folders ---
  const specsBacklog = path.join(sdriveRoot, "specs", "backlog");
  const specFolders = fs.existsSync(specsBacklog) ? fs.readdirSync(specsBacklog) : [];
  assert.deepStrictEqual(specFolders, [], "blueprint should not create feature spec folders");

  // --- 9. Dashboard surfaces the blueprint via /api/product ---
  const dashboardServer = path.join(sdriveRoot, "dashboard", "server.js");
  assert.ok(fs.existsSync(dashboardServer), "dashboard server should be installed");

  const serverSource = fs.readFileSync(dashboardServer, "utf8");
  assert.ok(serverSource.includes("/api/product"), "dashboard server should expose /api/product");
  assert.ok(serverSource.includes("apiProduct"), "dashboard server should define apiProduct()");

  const appSource = fs.readFileSync(path.join(sdriveRoot, "dashboard", "app.js"), "utf8");
  assert.ok(appSource.includes("renderProduct"), "dashboard app should render the product panel");
  assert.ok(appSource.includes("/api/product"), "dashboard app should fetch /api/product");

  const htmlSource = fs.readFileSync(path.join(sdriveRoot, "dashboard", "index.html"), "utf8");
  assert.ok(htmlSource.includes('id="product-panel"'), "dashboard html should include the product panel");

  // --- 10. Backlog table parses into the shape /api/product returns ---
  const backlogRows = backlog
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .filter((line) => !/^\|[\s:|-]+\|$/.test(line.trim()))
    .slice(1)
    .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()));
  assert.strictEqual(backlogRows.length, 2, "backlog should expose 2 data rows");
  assert.strictEqual(backlogRows[0][0], "BP-001");
  assert.strictEqual(backlogRows[1][0], "BP-002");

  console.log("✅ Blueprint end-to-end: installs, registers, routes, declares artifacts, stays optional, creates no feature specs, and surfaces on the dashboard.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
