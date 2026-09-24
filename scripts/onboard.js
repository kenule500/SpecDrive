#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const sdriveRoot = path.join(projectRoot, ".sdrive");
const onboardingDir = path.join(sdriveRoot, "onboarding");

const inventoryPath = path.join(onboardingDir, "inventory.json");
const reportPath = path.join(onboardingDir, "report.md");

// Files we look for to detect the project stack and conventions.
const DETECT_FILES = {
  manifests: [
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "pubspec.yaml",
    "Cargo.toml",
    "pom.xml",
    "build.gradle"
  ],
  docs: [
    "README.md",
    "CONTRIBUTING.md"
  ],
  codeRoots: [
    "src",
    "app",
    "lib",
    "pages",
    "server",
    "internal",
    "cmd",
    "pkg",
    "api",
    "apps",
    "packages"
  ],
  ci: [
    ".github/workflows",
    ".gitlab-ci.yml"
  ],
  tests: [
    "tests",
    "__tests__",
    "spec",
    "test"
  ],
  configs: [
    "tsconfig.json",
    "jsconfig.json",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.json",
    ".prettierrc",
    ".prettierrc.js",
    ".prettierrc.json"
  ],
  specdrive: [
    ".sdrive/constitution.md",
    ".sdrive/skills",
    ".sdrive/specs",
    ".sdrive/governance",
    ".sdrive/workflow-state.json",
    ".sdrive/schemas",
    ".sdrive/scripts",
    ".sdrive/commands",
    ".sdrive/agents",
    ".sdrive/dashboard",
    ".sdrive/mcp"
  ]
};

function exists(relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function countFiles(relativePath) {
  const full = path.join(projectRoot, relativePath);

  if (!fs.existsSync(full)) return 0;

  const stat = fs.statSync(full);
  if (!stat.isDirectory()) return 1;

  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const fullEntry = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullEntry);
      } else {
        count++;
      }
    }
  };
  walk(full);
  return count;
}

function scanSection(list) {
  const result = [];
  for (const relativePath of list) {
    const present = exists(relativePath);
    result.push({
      path: relativePath,
      present,
      fileCount: present ? countFiles(relativePath) : 0
    });
  }
  return result;
}

function buildInventory() {
  const inventory = {
    projectRoot,
    scannedAt: new Date().toISOString(),
    mode: "brownfield",
    sections: {
      manifests: scanSection(DETECT_FILES.manifests),
      docs: scanSection(DETECT_FILES.docs),
      codeRoots: scanSection(DETECT_FILES.codeRoots),
      ci: scanSection(DETECT_FILES.ci),
      tests: scanSection(DETECT_FILES.tests),
      configs: scanSection(DETECT_FILES.configs),
      specdrive: scanSection(DETECT_FILES.specdrive)
    },
    missing: [],
    present: [],
    deferred: []
  };

  const flatten = (section) => section.map((item) => item);

  const all = [
    ...flatten(inventory.sections.manifests),
    ...flatten(inventory.sections.docs),
    ...flatten(inventory.sections.codeRoots),
    ...flatten(inventory.sections.ci),
    ...flatten(inventory.sections.tests),
    ...flatten(inventory.sections.configs),
    ...flatten(inventory.sections.specdrive)
  ];

  for (const item of all) {
    if (item.present) {
      inventory.present.push(item.path);
    } else {
      inventory.missing.push(item.path);
    }
  }

  return inventory;
}

function buildReport(inventory) {
  const lines = [];

  lines.push("# Onboarding Report");
  lines.push("");
  lines.push(`Scanned at: ${inventory.scannedAt}`);
  lines.push(`Project root: ${inventory.projectRoot}`);
  lines.push("");
  lines.push("## Present");
  inventory.present.forEach((p) => lines.push(`- ✅ ${p}`));
  lines.push("");
  lines.push("## Missing");
  inventory.missing.forEach((p) => lines.push(`- ❌ ${p}`));
  lines.push("");
  lines.push("## Deferred");
  if (inventory.deferred.length === 0) {
    lines.push("(none yet)");
  } else {
    inventory.deferred.forEach((p) => lines.push(`- ⚠️  ${p}`));
  }
  lines.push("");

  return lines.join("\n");
}

function main() {
  fs.mkdirSync(onboardingDir, { recursive: true });

  const inventory = buildInventory();
  fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));

  const report = buildReport(inventory);
  fs.writeFileSync(reportPath, report);

  console.log(`✅ Inventory written: ${path.relative(projectRoot, inventoryPath)}`);
  console.log(`✅ Report written:    ${path.relative(projectRoot, reportPath)}`);
  console.log("");
  console.log(`Present:  ${inventory.present.length}`);
  console.log(`Missing:  ${inventory.missing.length}`);
  console.log(`Deferred: ${inventory.deferred.length}`);
}

main();