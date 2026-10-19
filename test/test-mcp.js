// MCP server protocol checks.
//
// The server used to crash on a malformed line: the catch block called
// JSON.parse(line) again. A bad client message must produce a JSON-RPC parse
// error and leave the process able to answer the next request.
const path = require("path");
const { spawnSync } = require("child_process");
const { initProject, cleanup, TEST_ENV } = require("./helpers/sandbox");

const root = initProject({ prefix: "sdrive-mcp-" });
const server = path.join(root, ".sdrive", "mcp", "server.js");

function runServer(lines) {
  return spawnSync(process.execPath, [server], {
    cwd: root,
    env: TEST_ENV,
    input: `${lines.join("\n")}\n`,
    encoding: "utf8",
    timeout: 30000
  });
}

let failures = 0;

function check(label, condition, detail = "") {
  console.log(`${condition ? "✅ PASS" : "❌ FAIL"}: ${label}${condition || !detail ? "" : `\n   ${detail}`}`);
  if (!condition) failures += 1;
}

try {
  const result = runServer([
    "this is not json",
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" }
    }),
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  ]);

  const output = result.stdout || "";

  check("Malformed JSON produces a -32700 parse error", output.includes('"code":-32700'), output);
  check("The process keeps serving after a parse error", output.includes('"id":1'), output);
  check(
    "Protocol version is negotiated",
    output.includes('"protocolVersion":"2025-06-18"'),
    output
  );
  check("tools/list returns tools", output.includes("specdrive.next_action"), output);
  check("Server exits cleanly on stdin EOF", result.status === 0, result.stderr || String(result.status));
} finally {
  cleanup(root);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} MCP check(s) failed.`);
  process.exit(1);
}

console.log("\n✅ All MCP checks passed.");
