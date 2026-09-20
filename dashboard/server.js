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

function apiTraceability(name) {
  const tracePath = path.join(sdriveRoot, "governance", name, "traceability.json");
  return loadJson(tracePath, { rows: [] });
}

function apiVerification(name) {
  const verificationPath = path.join(sdriveRoot, "governance", name, "verification.json");
  return loadJson(verificationPath, { status: "not_run", summary: {}, items: {} });
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
      const name = url.replace("/api/traceability/", "");
      return res.end(JSON.stringify(apiTraceability(name)));
    }

    if (url.startsWith("/api/verification/")) {
      const name = url.replace("/api/verification/", "");
      return res.end(JSON.stringify(apiVerification(name)));
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