const path = require("path");
const { readJson } = require("./state");
const { verifyChain } = require("../../scripts/lib/audit-chain");

function verifyAuditLog(projectRoot) {
  const file = path.join(projectRoot, ".sdrive", "audit-log.json");
  const log = readJson(file, null);

  if (!log) {
    return {
      ok: true,
      checked: 0,
      legacy: 0,
      brokenAt: null,
      reason: "no audit log yet"
    };
  }

  return verifyChain(log);
}

module.exports = { verifyAuditLog };
