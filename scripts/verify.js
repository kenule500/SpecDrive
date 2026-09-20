#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

// ---------- Phase 1: Plan Reader ----------

function loadPlan(featureName) {
  const planPath = path.join(projectRoot, ".sdrive", "governance", featureName, "plan.json");

  if (!fs.existsSync(planPath)) {
    console.error(`❌ plan.json not found for feature "${featureName}".`);
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(planPath, "utf8"));
}

function extractPlanItems(plan) {
  const items = [];

  (plan.architecture?.components || []).forEach((c) => {
    items.push({ type: "component", name: c.name, action: c.action });
  });

  (plan.apiContracts || []).forEach((api) => {
    items.push({ type: "endpoint", method: api.method, path: api.path, action: api.action });
  });

  (plan.dataModel?.entities || []).forEach((entity) => {
    items.push({ type: "entity", name: entity.name, action: entity.action });
    (entity.fields || []).forEach((field) => {
      items.push({
        type: "field",
        entity: entity.name,
        name: field.name,
        fieldType: field.type,
        action: field.action
      });
    });
  });

  (plan.dependencies || []).forEach((dep) => {
    items.push({ type: "dependency", name: dep.name, action: dep.action });
  });

  return items;
}

// ---------- Phase 2: Code Scanner ----------

const CANDIDATE_ROOTS = [
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
];

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".expo",
  ".turbo",
  "coverage",
  "out",
  ".sdrive",
  ".cache",
  "vendor"
]);

const CODE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".dart", ".java", ".kt",
  ".rb", ".php", ".cs", ".swift"
];

function readConstitutionSources() {
  const constitutionPath = path.join(projectRoot, ".sdrive", "constitution.md");

  if (!fs.existsSync(constitutionPath)) return [];

  const content = fs.readFileSync(constitutionPath, "utf8");
  const matches = content.match(/`([^`]+)\/`/g) || [];

  return matches
    .map((m) => m.replace(/`/g, "").replace(/\/$/, ""))
    .filter((p) => CANDIDATE_ROOTS.includes(p));
}

function detectSourceRoots() {
  const fromConstitution = readConstitutionSources();

  if (fromConstitution.length > 0) {
    return fromConstitution.filter((r) => fs.existsSync(path.join(projectRoot, r)));
  }

  return CANDIDATE_ROOTS.filter((r) => fs.existsSync(path.join(projectRoot, r)));
}

function walkDirectory(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(fullPath, files);
    } else if (CODE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

function scanCode() {
  const roots = detectSourceRoots();

  if (roots.length === 0) {
    console.warn("⚠️  No source folders detected.");
    return { files: [], roots: [] };
  }

  console.log(`🔍 Scanning roots: ${roots.join(", ")}\n`);

  const files = [];
  roots.forEach((root) => {
    walkDirectory(path.join(projectRoot, root), files);
  });

  console.log(`📄 Found ${files.length} source files.\n`);

  return { files, roots };
}


// ---------- Phase 3: Diff Engine ----------

function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return "";
  }
}

function detectComponents(files) {
  const components = [];

  files.forEach((file) => {
    const content = readFileContent(file);
    const relative = path.relative(projectRoot, file).replace(/\\/g, "/");
    const basename = path.basename(file, path.extname(file));

    // React / Vue / Svelte components
    const componentMatches = content.match(
      /(?:export\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9_]+)/
    );

    if (componentMatches && /components?\//i.test(relative)) {
      components.push({
        name: componentMatches[1],
        file: relative,
        basename
      });
    }
  });

  return components;
}

function detectEndpoints(files) {
  const endpoints = [];

  files.forEach((file) => {
    const content = readFileContent(file);
    const relative = path.relative(projectRoot, file).replace(/\\/g, "/");

    // Express / Fastify / Koa
    const expressMatches = content.matchAll(
      /(?:app|router)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi
    );

    for (const match of expressMatches) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: relative
      });
    }

    // FastAPI / Flask
    const fastapiMatches = content.matchAll(
      /@(?:app|router)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi
    );

    for (const match of fastapiMatches) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: relative
      });
    }

    // Next.js API routes
    if (/pages\/api\//.test(relative)) {
      const route = relative.replace("pages/api", "").replace(/\.[jt]sx?$/, "");
      endpoints.push({
        method: "GET",
        path: `/api${route}`,
        file: relative
      });
    }
  });

  return endpoints;
}

function detectEntities(files) {
  const entities = [];

  files.forEach((file) => {
    const content = readFileContent(file);
    const relative = path.relative(projectRoot, file).replace(/\\/g, "/");

    // SQL CREATE TABLE
    const sqlMatches = content.matchAll(/CREATE TABLE\s+(\w+)/gi);
    for (const match of sqlMatches) {
      entities.push({
        name: match[1],
        file: relative
      });
    }

    // Prisma models
    const prismaMatches = content.matchAll(/model\s+(\w+)/g);
    for (const match of prismaMatches) {
      entities.push({
        name: match[1],
        file: relative
      });
    }

    // TypeORM entities
    const typeormMatches = content.matchAll(/@Entity\([^)]*\)\s*class\s+(\w+)/g);
    for (const match of typeormMatches) {
      entities.push({
        name: match[1],
        file: relative
      });
    }
  });

  return entities;
}

function detectFields(files) {
  const fields = [];

  files.forEach((file) => {
    const content = readFileContent(file);
    const relative = path.relative(projectRoot, file).replace(/\\/g, "/");

    // SQL fields inside CREATE TABLE
    const tableBlocks = content.matchAll(
      /CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\)/gi
    );

    for (const block of tableBlocks) {
      const entity = block[1];
      const body = block[2];

      const fieldMatches = body.matchAll(/^\s*(\w+)\s+\w+/gm);

      for (const field of fieldMatches) {
        fields.push({
          entity,
          name: field[1],
          file: relative
        });
      }
    }

    // Prisma fields
    const prismaBlocks = content.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\}/g);

    for (const block of prismaBlocks) {
      const entity = block[1];
      const body = block[2];

      const fieldMatches = body.matchAll(/^\s*(\w+)\s+\w+/gm);

      for (const field of fieldMatches) {
        fields.push({
          entity,
          name: field[1],
          file: relative
        });
      }
    }
  });

  return fields;
}

function detectDependencies() {
  const pkgPath = path.join(projectRoot, "package.json");

  if (!fs.existsSync(pkgPath)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {})
    ];
  } catch (error) {
    return [];
  }
}

function diffPlanAgainstCode(planItems, code) {
  const matched = [];
  const missing = [];
  const renamed = [];
  const extra = [];

  const codeComponents = detectComponents(code.files);
  const codeEndpoints = detectEndpoints(code.files);
  const codeEntities = detectEntities(code.files);
  const codeFields = detectFields(code.files);
  const codeDependencies = detectDependencies();

  planItems.forEach((item) => {
    if (item.type === "component") {
      const found = codeComponents.find((c) => c.name === item.name);

      if (found) {
        matched.push({ ...item, file: found.file });
      } else {
        // possible rename: same folder or similar name
        const similar = codeComponents.find((c) =>
          c.name.toLowerCase().includes(item.name.toLowerCase().slice(0, 5))
        );

        if (similar) {
          renamed.push({ ...item, to: similar.name, file: similar.file });
        } else {
          missing.push(item);
        }
      }
    }

    if (item.type === "endpoint") {
      const found = codeEndpoints.find(
        (e) => e.method === item.method && e.path === item.path
      );

      if (found) {
        matched.push({ ...item, file: found.file });
      } else {
        missing.push(item);
      }
    }

    if (item.type === "entity") {
      const found = codeEntities.find((e) => e.name === item.name);

      if (found) {
        matched.push({ ...item, file: found.file });
      } else {
        missing.push(item);
      }
    }

    if (item.type === "field") {
      const found = codeFields.find(
        (f) => f.entity === item.entity && f.name === item.name
      );

      if (found) {
        matched.push({ ...item, file: found.file });
      } else {
        missing.push(item);
      }
    }

    if (item.type === "dependency") {
      if (codeDependencies.includes(item.name)) {
        matched.push(item);
      } else {
        missing.push(item);
      }
    }
  });

  // Extra code detection
  codeComponents.forEach((c) => {
    if (!planItems.some((p) => p.type === "component" && p.name === c.name)) {
      extra.push({ type: "component", name: c.name, file: c.file });
    }
  });

  codeEndpoints.forEach((e) => {
    if (!planItems.some((p) => p.type === "endpoint" && p.path === e.path)) {
      extra.push({ type: "endpoint", method: e.method, path: e.path, file: e.file });
    }
  });

  return { matched, missing, renamed, extra };
}


// ---------- Phase 4: Report Writer ----------

function determineStatus(result) {
  if (result.missing.length > 0) return "fail";
  if (result.renamed.length > 0) return "fail";
  if (result.extra.length > 0) return "warn";
  return "pass";
}

function writeReport(featureName, result) {
  const status = determineStatus(result);

  const report = {
    feature: featureName,
    status,
    checkedAt: new Date().toISOString(),
    summary: {
      matched: result.matched.length,
      missing: result.missing.length,
      renamed: result.renamed.length,
      extra: result.extra.length
    },
    items: {
      matched: result.matched,
      missing: result.missing,
      renamed: result.renamed,
      extra: result.extra
    }
  };

  const reportPath = path.join(
    projectRoot,
    ".sdrive",
    "governance",
    featureName,
    "verification.json"
  );

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return { status, reportPath };
}


// ---------- Entry ----------

const featureName = process.argv[2];

if (!featureName) {
  console.error("❌ Usage: node verify.js <feature-name>");
  process.exit(1);
}

const plan = loadPlan(featureName);
const planItems = extractPlanItems(plan);
const code = scanCode();

const result = diffPlanAgainstCode(planItems, code);
const { status, reportPath } = writeReport(featureName, result);

console.log("\n📊 Verification Result\n");
console.log(`✅ Matched:  ${result.matched.length}`);
console.log(`❌ Missing:  ${result.missing.length}`);
console.log(`⚠️  Renamed: ${result.renamed.length}`);
console.log(`➕ Extra:    ${result.extra.length}`);
console.log(`\n🧾 Status:   ${status.toUpperCase()}`);
console.log(`📁 Report:   ${path.relative(projectRoot, reportPath)}\n`);

if (result.missing.length > 0) {
  console.log("❌ Missing:");
  result.missing.forEach((i) => {
    console.log(`  [${i.type}] ${i.name || i.path}`);
  });
}

if (result.renamed.length > 0) {
  console.log("\n⚠️  Renamed:");
  result.renamed.forEach((i) => {
    console.log(`  [${i.type}] ${i.name} → ${i.to}`);
  });
}

if (result.extra.length > 0) {
  console.log("\n➕ Extra (not in plan):");
  result.extra.forEach((i) => {
    console.log(`  [${i.type}] ${i.name || i.path}`);
  });
}

process.exit(status === "fail" ? 1 : 0);

module.exports = {
  loadPlan,
  extractPlanItems,
  scanCode,
  diffPlanAgainstCode,
  writeReport
};