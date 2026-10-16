#!/usr/bin/env node
/*
 * Guards monorepo workspace detection in scripts/onboard.js.
 *
 * Why this exists: the scan used to consult a fixed codeRoots list, so in a
 * monorepo it would find `server/` and silently miss `client/`. Everything built
 * on the inventory afterwards - the constitution, retroactive specs - inherited
 * that blind spot without saying so. These cases pin the manifest formats the
 * scan must understand, and the ones it must deliberately NOT pretend to.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ONBOARD = path.join(__dirname, "..", "scripts", "onboard.js");

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const pass = a === e;
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label.padEnd(52)} ${pass ? a : `got ${a}, want ${e}`}`);
}

// spec maps relative paths to file contents; a null value creates a directory.
function makeProject(name, spec) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `sdrive-ws-${name}-`));
  for (const [rel, content] of Object.entries(spec)) {
    const full = path.join(root, rel);
    if (content === null) {
      fs.mkdirSync(full, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }
  return root;
}

function scan(root) {
  const result = spawnSync(process.execPath, [ONBOARD], { cwd: root, encoding: "utf8" });
  const inventory = JSON.parse(
    fs.readFileSync(path.join(root, ".sdrive", "onboarding", "inventory.json"), "utf8")
  );
  const report = fs.readFileSync(path.join(root, ".sdrive", "onboarding", "report.md"), "utf8");
  return { result, inventory, report };
}

function withProject(name, spec, run) {
  const root = makeProject(name, spec);
  try {
    run(scan(root), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const pkg = (name) => JSON.stringify({ name, version: "0.0.0" }, null, 2) + "\n";

// ---------------------------------------------------------------- pnpm
withProject(
  "pnpm-literals",
  {
    "pnpm-workspace.yaml": "packages:\n  - 'client'\n  - 'server'\n  - 'api'\n",
    "client/package.json": pkg("client"),
    "server/package.json": pkg("server"),
    "api/package.json": pkg("api")
  },
  ({ inventory, report, result }) => {
    check("pnpm: exit code", result.status, 0);
    check("pnpm: detected", inventory.workspaces.detected, true);
    check("pnpm: source", inventory.workspaces.source, "pnpm-workspace.yaml");
    check("pnpm: packages", inventory.workspaces.packages, ["api", "client", "server"]);

    // The point of the whole change: these must be scanned code roots, not just
    // listed as workspaces.
    const roots = inventory.sections.codeRoots.filter((r) => ["api", "client", "server"].includes(r.path));
    check(
      "pnpm: packages are code roots",
      roots.map((r) => r.path).sort(),
      ["api", "client", "server"]
    );
    check(
      "pnpm: packages marked present",
      roots.every((r) => r.present),
      true
    );
    check("pnpm: in present list", ["api", "client", "server"].every((p) => inventory.present.includes(p)), true);
    check("pnpm: report section", report.includes("## Monorepo Workspaces"), true);
  }
);

// pnpm-workspace.yaml with a comment and a following key, to prove the packages
// block ends correctly rather than swallowing the next section.
withProject(
  "pnpm-comments",
  {
    "pnpm-workspace.yaml": "packages:\n  - 'apps/*' # inline comment\n\nonlyBuiltDependencies:\n  - esbuild\n",
    "apps/web/package.json": pkg("web"),
    "onlyBuiltDependencies/package.json": pkg("should-not-be-detected")
  },
  ({ inventory }) => {
    check("pnpm: inline comment stripped", inventory.workspaces.patterns, ["apps/*"]);
    check("pnpm: glob expanded", inventory.workspaces.packages, ["apps/web"]);
    check(
      "pnpm: block ended before next key",
      inventory.workspaces.packages.includes("onlyBuiltDependencies"),
      false
    );
  }
);

// ---------------------------------------------------------------- npm workspaces
withProject(
  "npm-array",
  {
    "package.json": JSON.stringify({ name: "root", workspaces: ["web", "docs"] }, null, 2),
    "web/package.json": pkg("web"),
    "docs/package.json": pkg("docs")
  },
  ({ inventory }) => {
    check("npm array: detected", inventory.workspaces.detected, true);
    check("npm array: source", inventory.workspaces.source, "package.json#workspaces");
    check("npm array: packages", inventory.workspaces.packages, ["docs", "web"]);
  }
);

withProject(
  "npm-object",
  {
    "package.json": JSON.stringify({ name: "root", workspaces: { packages: ["libs/*"] } }, null, 2),
    "libs/core/package.json": pkg("core"),
    "libs/ui/package.json": pkg("ui")
  },
  ({ inventory }) => {
    check("npm object: detected", inventory.workspaces.detected, true);
    check("npm object: packages", inventory.workspaces.packages, ["libs/core", "libs/ui"]);
  }
);

// ---------------------------------------------------------------- lerna
withProject(
  "lerna",
  {
    "lerna.json": JSON.stringify({ version: "1.0.0", packages: ["packages/*"] }, null, 2),
    "packages/a/package.json": pkg("a")
  },
  ({ inventory }) => {
    check("lerna: detected", inventory.workspaces.detected, true);
    check("lerna: source", inventory.workspaces.source, "lerna.json");
    check("lerna: packages", inventory.workspaces.packages, ["packages/a"]);
  }
);

// ---------------------------------------------------------------- glob edge cases
withProject(
  "glob-edges",
  {
    "pnpm-workspace.yaml": "packages:\n  - 'packages/**'\n  - 'tools'\n",
    // Matches packages/* but is not a package: no manifest of its own.
    "packages/not-a-package/index.js": "module.exports = 1;\n",
    // Nested one level deeper: only reachable because the pattern uses **.
    "packages/outer/inner/package.json": pkg("inner"),
    "packages/outer/package.json": pkg("outer"),
    "tools/package.json": pkg("tools"),
    // Must never be treated as a workspace package.
    "packages/outer/node_modules/dep/package.json": pkg("dep")
  },
  ({ inventory }) => {
    check("glob: deep match found", inventory.workspaces.packages.includes("packages/outer/inner"), true);
    check("glob: intermediate match found", inventory.workspaces.packages.includes("packages/outer"), true);
    check("glob: literal mixed with glob", inventory.workspaces.packages.includes("tools"), true);
    check("glob: non-package dir excluded", inventory.workspaces.packages.includes("packages/not-a-package"), false);
    check("glob: node_modules excluded", inventory.workspaces.packages.includes("packages/outer/node_modules/dep"), false);
  }
);

// ---------------------------------------------------------------- signals only
withProject("turbo-only", { "turbo.json": "{}\n", "src/index.js": "x\n" }, ({ inventory, report }) => {
  // Turborepo keeps no package list, so this must NOT claim to have found one.
  check("turbo only: detected", inventory.workspaces.detected, false);
  check("turbo only: signals", inventory.workspaces.signals, ["turbo.json"]);
  check("turbo only: no packages", inventory.workspaces.packages, []);
  check("turbo only: report still mentions it", report.includes("## Monorepo Workspaces"), true);
});

// ---------------------------------------------------------------- plain project
withProject("plain", { "src/index.js": "x\n", "package.json": JSON.stringify({ name: "plain" }) }, ({ inventory, report }) => {
  check("plain: not a monorepo", inventory.workspaces.detected, false);
  check("plain: no packages", inventory.workspaces.packages, []);
  check("plain: no signals", inventory.workspaces.signals, []);
  check("plain: no report section", report.includes("## Monorepo Workspaces"), false);
  check("plain: codeRoots unchanged", inventory.sections.codeRoots.some((r) => r.path === "src" && r.present), true);
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall workspace-detection cases passed");
