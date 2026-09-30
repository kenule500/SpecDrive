#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = process.cwd();
const sdriveRoot = path.join(projectRoot, ".sdrive");

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (error) {
    return "";
  }
}

function apiGitInfo() {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch) {
    return { available: false };
  }

  const commit = git(["rev-parse", "--short", "HEAD"]);
  const subject = git(["log", "-1", "--pretty=%s"]);
  const author = git(["log", "-1", "--pretty=%an"]);
  const committedAt = git(["log", "-1", "--pretty=%cI"]);
  const dirty = git(["status", "--porcelain"]).length > 0;

  // Determine the branch this one was merged from / branched off.
  // Prefer the upstream tracking branch, then the default branch, then the
  // most recent merged-in branch recorded in the reflog.
  let mergedFrom = "";
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (upstream && upstream !== branch) {
    mergedFrom = upstream.replace(/^origin\//, "");
  }

  if (!mergedFrom) {
    const defaultBranch = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
      .replace(/^origin\//, "");
    if (defaultBranch && defaultBranch !== branch) {
      mergedFrom = defaultBranch;
    }
  }

  if (!mergedFrom) {
    const reflog = git(["reflog", "--grep-reflog=merge", "--pretty=%gs", "-n", "1"]);
    const match = reflog.match(/merge\s+([^:]+):/);
    if (match) {
      mergedFrom = match[1].trim();
    }
  }

  const ahead = git(["rev-list", "--count", "@{upstream}..HEAD"]);
  const behind = git(["rev-list", "--count", "HEAD..@{upstream}"]);

  return {
    available: true,
    branch,
    commit,
    subject,
    author,
    committedAt,
    dirty,
    mergedFrom: mergedFrom || null,
    ahead: ahead ? parseInt(ahead, 10) : 0,
    behind: behind ? parseInt(behind, 10) : 0
  };
}

function loadJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function apiWorkflowState() {
  return loadJson(path.join(sdriveRoot, "workflow-state.json"), { features: [] });
}

function apiAuditLog() {
  return loadJson(path.join(sdriveRoot, "audit-log.json"), { events: [] });
}

function apiTeam() {
  return loadJson(path.join(sdriveRoot, "team.json"), { members: [] });
}

function apiTraceability(feature, version) {
  const tracePath = path.join(sdriveRoot, "governance", feature, version, "traceability.json");
  return loadJson(tracePath, { rows: [] });
}

function apiVerification(feature, version) {
  const verificationPath = path.join(sdriveRoot, "governance", feature, version, "verification.json");
  return loadJson(verificationPath, { status: "not_run", summary: {}, items: {} });
}

function apiTestReport(feature, version) {
  const reportDir = path.join(sdriveRoot, "reports", "tests");

  if (!fs.existsSync(reportDir)) {
    return { status: "not_run", summary: {}, tests: [] };
  }

  const files = fs.readdirSync(reportDir)
    .filter((f) => f.startsWith(`test-report-${feature}-${version}-`))
    .sort()
    .reverse();

  if (files.length === 0) {
    return { status: "not_run", summary: {}, tests: [] };
  }

  const latest = path.join(reportDir, files[0]);
  const content = fs.readFileSync(latest, "utf8");

  const totalMatch = content.match(/Total ACs:\*\*\s*(\d+)/);
  const testedMatch = content.match(/Tested ACs:\*\*\s*(\d+)/);
  const coverageMatch = content.match(/Coverage:\*\*\s*(\d+)/);
  const passedMatch = content.match(/Tests Passed:\*\*\s*(\d+)\/(\d+)/);

  return {
    status:
      testedMatch && totalMatch && testedMatch[1] === totalMatch[1]
        ? "complete"
        : "partial",
    file: files[0],
    summary: {
      totalACs: totalMatch ? parseInt(totalMatch[1]) : 0,
      testedACs: testedMatch ? parseInt(testedMatch[1]) : 0,
      coverage: coverageMatch ? parseInt(coverageMatch[1]) : 0,
      passed: passedMatch ? parseInt(passedMatch[1]) : 0,
      total: passedMatch ? parseInt(passedMatch[2]) : 0
    }
  };
}

function parseFeatureVersion(url) {
  const parts = url.split("/").filter(Boolean);
  return {
    feature: parts[parts.length - 2],
    version: parts[parts.length - 1]
  };
}

function serveStatic(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "Content-Type": contentType });
  res.end(fs.readFileSync(filePath));
}

function apiOnboarding() {
  const state = loadJson(path.join(sdriveRoot, "workflow-state.json"), { features: [] });
  return state.onboarding || null;
}

function readProductFile(fileName) {
  const filePath = path.join(sdriveRoot, "product", fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return null;
  }
}

function parseBacklog(markdown) {
  if (!markdown) return [];

  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length < 3) continue;
    if (/^id$/i.test(cells[0])) continue;

    rows.push({ id: cells[0], feature: cells[1], status: cells[2] });
  }

  return rows;
}

function apiProduct() {
  const overview = readProductFile("overview.md");
  const mockup = readProductFile("mockup.md");
  const designSystem = readProductFile("design-system.md");
  const roadmap = readProductFile("roadmap.md");
  const backlogMarkdown = readProductFile("backlog.md");

  const exists = Boolean(overview || mockup || designSystem || roadmap || backlogMarkdown);

  return {
    exists,
    overview,
    mockup,
    designSystem,
    roadmap,
    backlog: parseBacklog(backlogMarkdown)
  };
}

// Static CLI command reference. Kept in sync with src/index.js.
const CLI_COMMANDS = [
  { command: "sdrive init", description: "Initialize SpecDrive structure, tool adapters, and default template", group: "Setup" },
  { command: "sdrive onboard", description: "Scan an existing project for onboarding (usually run by /sdrive:onboard)", group: "Setup" },
  { command: "sdrive config:validate", description: "Validate .sdrive/config.json", group: "Setup" },
  { command: "sdrive template:list", description: "List available templates", group: "Setup" },
  { command: "sdrive template:set <name>", description: "Set the default template", group: "Setup" },
  { command: "sdrive hooks:install", description: "Install the SpecDrive pre-commit hook", group: "Setup" },

  { command: "sdrive create <feature>", description: "Create a new feature scaffold (internal)", group: "Features" },
  { command: "sdrive status", description: "Show feature lifecycle state", group: "Features" },
  { command: "sdrive version:new <feature>", description: "Create a new version of a feature", group: "Features" },
  { command: "sdrive reopen <feature>", description: "Reopen a completed feature", group: "Features" },
  { command: "sdrive diff:version <feature> <a> <b>", description: "Compare two versions of a feature", group: "Features" },

  { command: "sdrive validate", description: "Validate SpecDrive governance files", group: "Governance" },
  { command: "sdrive verify <feature>", description: "Verify code matches the plan (spec-to-code diff)", group: "Governance" },
  { command: "sdrive approve <gate>", description: "Approve a workflow gate (specification, planning, implementation, review)", group: "Governance" },
  { command: "sdrive diff <oldFile> <newFile>", description: "Show differences between two spec files", group: "Governance" },
  { command: "sdrive openapi:generate <feature>", description: "Generate an OpenAPI spec from plan.json API contracts", group: "Governance" },

  { command: "sdrive team:add <username> <role>", description: "Add a new team member", group: "Team" },
  { command: "sdrive team:remove <username>", description: "Remove a team member", group: "Team" },
  { command: "sdrive team:list", description: "List all team members", group: "Team" },
  { command: "sdrive team:update <username> <role>", description: "Update a team member's role", group: "Team" },
  { command: "sdrive team:sync", description: "Sync team members from GitHub collaborators", group: "Team" },

  { command: "sdrive dashboard", description: "Start the SpecDrive web dashboard", group: "Dashboard" }
];

function apiCommands() {
  const manifestPath = path.join(sdriveRoot, "commands", "manifest.json");
  const manifest = loadJson(manifestPath, { commands: [] });

  const slash = (manifest.commands || []).map((c) => ({
    command: c.command,
    description: c.description || "",
    agent: c.agent || "",
    acceptsFeature: Boolean(c.acceptsFeature),
    gates: c.gates || []
  }));

  return { slash, cli: CLI_COMMANDS };
}

const server = http.createServer((req, res) => {
  const url = req.url;

  if (url.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });

    if (url === "/api/workflow-state") {
      return res.end(JSON.stringify(apiWorkflowState()));
    }

    if (url === "/api/audit-log") {
      return res.end(JSON.stringify(apiAuditLog()));
    }

    if (url === "/api/team") {
      return res.end(JSON.stringify(apiTeam()));
    }

    if (url.startsWith("/api/traceability/")) {
      const { feature, version } = parseFeatureVersion(url);
      return res.end(JSON.stringify(apiTraceability(feature, version)));
    }

    if (url.startsWith("/api/verification/")) {
      const { feature, version } = parseFeatureVersion(url);
      return res.end(JSON.stringify(apiVerification(feature, version)));
    }

    if (url.startsWith("/api/tests/")) {
      const { feature, version } = parseFeatureVersion(url);
      return res.end(JSON.stringify(apiTestReport(feature, version)));
    }

    if (url === "/api/onboarding") {
      return res.end(JSON.stringify(apiOnboarding()));
    }

    if (url === "/api/product") {
      return res.end(JSON.stringify(apiProduct()));
    }

    if (url === "/api/git-info") {
      return res.end(JSON.stringify(apiGitInfo()));
    }

    if (url === "/api/commands") {
      return res.end(JSON.stringify(apiCommands()));
    }

    res.writeHead(404);
    return res.end(JSON.stringify({ error: "Not found" }));
  }

  if (url === "/" || url === "/index.html") {
    return serveStatic(res, path.join(__dirname, "index.html"), "text/html");
  }

  if (url === "/style.css") {
    return serveStatic(res, path.join(__dirname, "style.css"), "text/css");
  }

  if (url === "/app.js") {
    return serveStatic(res, path.join(__dirname, "app.js"), "application/javascript");
  }

  if (url === "/logo.png") {
    const logoCandidates = [
      path.join(__dirname, "logo.png"),
      path.join(__dirname, "..", "logo.png"),
      path.join(__dirname, "..", "..", "logo.png")
    ];
    const logoPath = logoCandidates.find((candidate) => fs.existsSync(candidate));
    if (logoPath) {
      return serveStatic(res, logoPath, "image/png");
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

const PORT = 4747;

server.listen(PORT, () => {
  console.log(`\n🚀 SpecDrive Dashboard running at http://localhost:${PORT}\n`);
});