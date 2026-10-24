// MCP default-server wiring.
//
// These checks lock in the two properties that matter to a user's existing
// setup: the built-in knowledge servers are added by default, and an entry the
// user already has is never replaced.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const mcp = require("../src/lib/mcp");
const { initProject, cleanup, runCli, readJson, writeJson } = require("./helpers/sandbox");

const serverPath = path.join(os.tmpdir(), "sdrive-mcp-unit", ".sdrive", "mcp", "server.js");

test("default entries include SpecDrive and the three knowledge servers", () => {
  const entries = mcp.defaultEntries("Cursor", serverPath);

  assert.deepEqual(Object.keys(entries).sort(), [
    "context7",
    "specdrive",
    "stackwise",
    "ux-ui-library"
  ]);
  assert.deepEqual(entries.specdrive, { command: "node", args: [serverPath] });
  assert.equal(entries["ux-ui-library"].url, "https://ux-ui-library.vercel.app/api/mcp");
  assert.equal(entries.stackwise.url, "https://stackwisehq.vercel.app/api/mcp");
  assert.equal(entries.context7.url, "https://mcp.context7.com/mcp");
});

test("includeKnowledge:false keeps only the governance server", () => {
  const entries = mcp.defaultEntries("Cursor", serverPath, { includeKnowledge: false });

  assert.deepEqual(Object.keys(entries), ["specdrive"]);
});

test("remote entries use each client's native transport shape", () => {
  const claude = mcp.defaultEntries("Claude Desktop", serverPath);
  assert.deepEqual(claude["ux-ui-library"], {
    command: "npx",
    args: ["-y", "mcp-remote", "https://ux-ui-library.vercel.app/api/mcp", "--transport", "http-only"]
  });

  assert.deepEqual(mcp.defaultEntries("Cursor", serverPath).stackwise, {
    url: "https://stackwisehq.vercel.app/api/mcp"
  });
  assert.deepEqual(mcp.defaultEntries("Cline", serverPath).stackwise, {
    type: "streamableHttp",
    url: "https://stackwisehq.vercel.app/api/mcp"
  });
  assert.deepEqual(mcp.defaultEntries("Roo Code", serverPath).stackwise, {
    type: "streamable-http",
    url: "https://stackwisehq.vercel.app/api/mcp"
  });
  assert.deepEqual(mcp.defaultEntries("Gemini CLI", serverPath).stackwise, {
    httpUrl: "https://stackwisehq.vercel.app/api/mcp"
  });
  assert.deepEqual(mcp.defaultEntries("GitHub Copilot (VS Code)", serverPath).stackwise, {
    type: "http",
    url: "https://stackwisehq.vercel.app/api/mcp"
  });
  assert.deepEqual(mcp.defaultEntries("GitHub Copilot (VS Code)", serverPath).specdrive, {
    type: "stdio",
    command: "node",
    args: [serverPath]
  });
});

test("merge preserves user entries, including a custom context7", () => {
  const existing = {
    mcpServers: {
      mine: { command: "node", args: ["mine.js"] },
      context7: { url: "https://custom.example/mcp" }
    },
    shared: true
  };

  const merged = mcp.mergeMcpConfig(existing, "Cursor", serverPath);

  assert.deepEqual(merged.config.mcpServers.mine, existing.mcpServers.mine);
  assert.deepEqual(merged.config.mcpServers.context7, existing.mcpServers.context7);
  assert.equal(merged.config.shared, true);
  assert.ok(merged.config.mcpServers.specdrive);
  assert.ok(merged.config.mcpServers.stackwise);
  assert.ok(merged.config.mcpServers["ux-ui-library"]);
  assert.deepEqual(merged.added.sort(), ["specdrive", "stackwise", "ux-ui-library"]);
  assert.deepEqual(merged.kept, ["context7"]);
});

test("safeMergeMcpConfig writes once, then reports unchanged", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-mcp-config-"));
  const configPath = path.join(root, ".cursor", "mcp.json");

  try {
    writeJson(configPath, { mcpServers: { mine: { command: "node", args: ["mine.js"] } } });

    const first = mcp.safeMergeMcpConfig(configPath, "Cursor", serverPath);
    assert.equal(first.status, "merged");

    const written = readJson(configPath);
    assert.deepEqual(written.mcpServers.mine, { command: "node", args: ["mine.js"] });
    assert.ok(written.mcpServers.specdrive);
    assert.ok(written.mcpServers.context7);

    const second = mcp.safeMergeMcpConfig(configPath, "Cursor", serverPath);
    assert.equal(second.status, "unchanged");
  } finally {
    cleanup(root);
  }
});

test("an invalid mcpServers value is reported instead of replaced", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-mcp-invalid-"));
  const configPath = path.join(root, ".cursor", "mcp.json");

  try {
    writeJson(configPath, { mcpServers: [] });

    const result = mcp.safeMergeMcpConfig(configPath, "Cursor", serverPath);

    assert.equal(result.status, "error");
    assert.match(result.error, /must be a JSON object/);
    assert.deepEqual(readJson(configPath), { mcpServers: [] });
  } finally {
    cleanup(root);
  }
});

test("dry-run reports the change without writing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-mcp-dry-"));
  const configPath = path.join(root, ".cursor", "mcp.json");

  try {
    const result = mcp.safeMergeMcpConfig(configPath, "Cursor", serverPath, { dryRun: true });

    assert.equal(result.status, "would-create");
    assert.equal(fs.existsSync(configPath), false);
  } finally {
    cleanup(root);
  }
});

test("getMcpConfigPaths follows the project root and platform", () => {
  const root = path.join(os.tmpdir(), "sdrive-mcp-paths");
  const paths = mcp.getMcpConfigPaths({
    projectRoot: root,
    platform: "win32",
    appData: path.join(root, "appdata")
  });

  assert.equal(path.basename(paths.find((entry) => entry.name === "Cursor").path), "mcp.json");
  assert.ok(
    paths
      .find((entry) => entry.name === "Claude Desktop")
      .path.endsWith(path.join("Claude", "claude_desktop_config.json"))
  );
  assert.ok(
    paths
      .find((entry) => entry.name === "GitHub Copilot (VS Code)")
      .path.startsWith(root)
  );
});

test("mcp:sync adds defaults to an existing config and preserves user servers", () => {
  const root = initProject({ prefix: "sdrive-mcp-sync-" });

  try {
    const configPath = path.join(root, ".cursor", "mcp.json");
    writeJson(configPath, {
      mcpServers: {
        mine: { command: "node", args: ["mine.js"] },
        context7: { url: "https://custom.example/mcp" }
      }
    });

    const result = runCli(["mcp:sync", "--client", "cursor"], { cwd: root });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const config = readJson(configPath);
    assert.deepEqual(config.mcpServers.mine, { command: "node", args: ["mine.js"] });
    assert.deepEqual(config.mcpServers.context7, { url: "https://custom.example/mcp" });
    assert.ok(config.mcpServers.specdrive);
    assert.ok(config.mcpServers["ux-ui-library"]);
    assert.ok(config.mcpServers.stackwise);
  } finally {
    cleanup(root);
  }
});

test("mcp:sync --no-knowledge wires only SpecDrive", () => {
  const root = initProject({ prefix: "sdrive-mcp-noknowledge-" });

  try {
    const configPath = path.join(root, ".cursor", "mcp.json");
    const result = runCli(["mcp:sync", "--client", "cursor", "--no-knowledge"], { cwd: root });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const config = readJson(configPath);
    assert.ok(config.mcpServers.specdrive);
    assert.equal(config.mcpServers["ux-ui-library"], undefined);
    assert.equal(config.mcpServers.stackwise, undefined);
    assert.equal(config.mcpServers.context7, undefined);
  } finally {
    cleanup(root);
  }
});

test("mcp:list exposes the defaults and reports missing entries", () => {
  const root = initProject({ prefix: "sdrive-mcp-list-" });

  try {
    writeJson(path.join(root, ".cursor", "mcp.json"), {
      mcpServers: { specdrive: { command: "node", args: ["server.js"] } }
    });

    const result = runCli(["mcp:list", "--json"], { cwd: root });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.data.defaults.map((entry) => entry.name).sort(), [
      "context7",
      "stackwise",
      "ux-ui-library"
    ]);

    const cursor = payload.data.clients.find((entry) => entry.id === "cursor");
    assert.deepEqual(cursor.missing.sort(), ["context7", "stackwise", "ux-ui-library"]);
  } finally {
    cleanup(root);
  }
});
