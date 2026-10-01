const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const auditLogPath = path.join(projectRoot, ".sdrive", "audit-log.json");

function loadAuditLog() {
  if (!fs.existsSync(auditLogPath)) {
    return { events: [] };
  }

  try {
    return JSON.parse(fs.readFileSync(auditLogPath, "utf8"));
  } catch (error) {
    console.error(`⚠️  Could not parse audit log: ${error.message}`);
    return { events: [] };
  }
}

function saveAuditLog(log) {
  fs.writeFileSync(auditLogPath, JSON.stringify(log, null, 2));
}

function logEvent(event, details = {}) {
  const log = loadAuditLog();

  log.events.push({
    timestamp: new Date().toISOString(),
    ...details,
    event
  });

  saveAuditLog(log);
  console.log(`📝 Audit: ${event}`);
}

function getRecentEvents(count = 10) {
  const log = loadAuditLog();
  return log.events.slice(-count).reverse();
}

module.exports = {
  logEvent,
  loadAuditLog,
  saveAuditLog,
  getRecentEvents
};