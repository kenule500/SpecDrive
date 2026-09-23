#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const sdriveRoot = path.join(projectRoot, ".sdrive");

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

  res.writeHead(404);
  res.end("Not found");
});

const PORT = 4747;

server.listen(PORT, () => {
  console.log(`\n🚀 SpecDrive Dashboard running at http://localhost:${PORT}\n`);
});