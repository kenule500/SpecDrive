const Ajv = require("ajv");
const fs = require("fs");
const path = require("path");

const ajv = new Ajv({ allErrors: true });

const projectRoot = path.join(__dirname, "..", "..");

const schemaDir = path.join(projectRoot, ".sdrive", "schemas");
const governanceDir = path.join(projectRoot, ".sdrive", "governance");
const specsDir = path.join(projectRoot, ".sdrive", "specs");
const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

const configPath = path.join(projectRoot, ".sdrive", "config.json");
const configSchemaPath = path.join(schemaDir, "config.schema.json");

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Schema/file not found: ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateData(data, schema, label) {
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    console.log(`✅ ${label} is valid.`);
    return true;
  } else {
    console.log(`❌ ${label} is INVALID:`);
    console.log(validate.errors);
    return false;
  }
}

function validateConfig() {
  if (!fs.existsSync(configPath)) {
    console.log("⚠️  config.json not found. Skipping.");
    return true;
  }

  if (!fs.existsSync(configSchemaPath)) {
    console.log("⚠️  config.schema.json not found. Skipping config validation.");
    return true;
  }

  const schema = loadJson(configSchemaPath);
  const data = loadJson(configPath);
  return validateData(data, schema, "config.json");
}

function validateWorkflowState() {
  if (!fs.existsSync(workflowStatePath)) {
    console.log("⚠️  workflow-state.json not found. Skipping.");
    return true;
  }

  const schema = loadJson(path.join(schemaDir, "workflow-state.schema.json"));
  const data = loadJson(workflowStatePath);
  return validateData(data, schema, "workflow-state.json");
}

function validateFeature(featureName) {
  const featureDir = path.join(governanceDir, featureName);

  if (!fs.existsSync(featureDir)) {
    console.log(`⚠️  Feature "${featureName}" has no governance folder. Skipping.`);
    return true;
  }

  let failed = false;

  const files = [
    { file: "spec.json", schema: "spec.schema.json" },
    { file: "plan.json", schema: "plan.schema.json" },
    { file: "tasks.json", schema: "tasks.schema.json" },
    { file: "traceability.json", schema: "traceability.schema.json" }
  ];

  files.forEach(({ file, schema }) => {
    const filePath = path.join(featureDir, file);
    const schemaPath = path.join(schemaDir, schema);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  ${featureName}/${file} not found. Skipping.`);
      return;
    }

    const data = loadJson(filePath);
    const schemaData = loadJson(schemaPath);
    failed |= !validateData(data, schemaData, `${featureName}/${file}`);
  });

  return !failed;
}

function discoverFeatures() {
  const features = new Set();

  if (fs.existsSync(governanceDir)) {
    fs.readdirSync(governanceDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .forEach((d) => features.add(d.name));
  }

  ["backlog", "ongoing", "completed"].forEach((lifecycle) => {
    const lifecyclePath = path.join(specsDir, lifecycle);
    if (fs.existsSync(lifecyclePath)) {
      fs.readdirSync(lifecyclePath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .forEach((d) => features.add(d.name));
    }
  });

  return Array.from(features);
}

function main() {
  console.log("🔍 SpecDrive Governance Validation\n");

  let failed = false;

  failed |= !validateConfig();
  failed |= !validateWorkflowState();

  const features = discoverFeatures();

  if (features.length === 0) {
    console.log("⚠️  No features found under .sdrive/governance or .sdrive/specs.");
  }

  features.forEach((feature) => {
    console.log(`\n📁 Validating feature: ${feature}`);
    failed |= !validateFeature(feature);
  });

  console.log("\n----------------------------------------");

  if (failed) {
    console.log("❌ Validation FAILED. Fix the errors above.");
    process.exit(1);
  } else {
    console.log("✅ Governance validation complete. All files are valid.");
    process.exit(0);
  }
}

main();