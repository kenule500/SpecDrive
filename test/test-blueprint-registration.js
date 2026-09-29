const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const packageRoot = path.join(__dirname, "..");
const cliPath = path.join(packageRoot, "src", "index.js");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-blueprint-test-"));
const commandsDir = path.join(tempRoot, ".sdrive", "commands");
const testModulesRoot = path.join(tempRoot, "test-node-modules");

try {
  fs.mkdirSync(commandsDir, { recursive: true });
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
  fs.writeFileSync(
    path.join(commandsDir, "manifest.json"),
    JSON.stringify({
      prefix: "/sdrive:",
      version: "0.9.0",
      customField: "preserve-me",
      commands: [{ command: "/sdrive:custom", agent: "custom", agentFile: ".sdrive/agents/custom.md" }]
    })
  );
  fs.writeFileSync(
    path.join(commandsDir, "permissions.json"),
    JSON.stringify({
      version: "0.9.0",
      rules: { "/sdrive:custom": ["admin"] },
      cli: { init: ["admin"] }
    })
  );

  execFileSync(process.execPath, [cliPath, "init"], {
    cwd: tempRoot,
    input: "1\n1\n\n",
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, NODE_PATH: testModulesRoot }
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(commandsDir, "manifest.json"), "utf8"));
  const permissions = JSON.parse(fs.readFileSync(path.join(commandsDir, "permissions.json"), "utf8"));

  assert.ok(manifest.commands.some((command) => command.command === "/sdrive:blueprint"));
  assert.deepStrictEqual(permissions.rules["/sdrive:blueprint"], ["admin", "reviewer"]);
  assert.ok(manifest.commands.some((command) => command.command === "/sdrive:custom"));
  assert.strictEqual(manifest.customField, "preserve-me");
  assert.deepStrictEqual(permissions.rules["/sdrive:custom"], ["admin"]);
  assert.ok(fs.existsSync(path.join(tempRoot, ".sdrive", "agents", "12-blueprint.md")));

  fs.writeFileSync(path.join(tempRoot, ".sdrive", "scripts", "check-permission.js"), "process.exit(0);\n");
  const routerOutput = execFileSync(
    process.execPath,
    [path.join(tempRoot, ".sdrive", "commands", "router.js"), "/sdrive:blueprint"],
    { cwd: tempRoot, encoding: "utf8" }
  );
  assert.ok(routerOutput.includes("SpecDrive Command: /sdrive:blueprint"));
  assert.ok(routerOutput.includes("Agent: blueprint"));

  console.log("✅ Blueprint command installs, routes, and loads without overwriting custom config.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
