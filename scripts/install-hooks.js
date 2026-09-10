#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const hooksDir = path.join(projectRoot, ".git", "hooks");
const preCommitPath = path.join(hooksDir, "pre-commit");

const hookContent = `#!/bin/sh
node .sdrive/scripts/pre-commit.js
`;

if (!fs.existsSync(hooksDir)) {
  console.error("❌ .git/hooks not found. Are you in a Git repository?");
  process.exit(1);
}

fs.writeFileSync(preCommitPath, hookContent, { mode: 0o755 });
console.log("✅ Installed SpecDrive pre-commit hook.");
console.log("   Governance validation will now run before every commit.");