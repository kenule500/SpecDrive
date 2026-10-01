#!/usr/bin/env node

const Ajv = require("ajv");
const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

const configPath = path.join(projectRoot, ".sdrive", "config.json");
const schemaPath = path.join(projectRoot, ".sdrive", "schemas", "config.schema.json");

if (!fs.existsSync(configPath)) {
  console.error("❌ config.json not found. Run `sdrive init` first.");
  process.exit(1);
}

if (!fs.existsSync(schemaPath)) {
  console.error("❌ config.schema.json not found.");
  process.exit(1);
}

const ajv = new Ajv({ allErrors: true });
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const validate = ajv.compile(schema);
const valid = validate(config);

if (valid) {
  console.log("✅ config.json is valid.");
  process.exit(0);
} else {
  console.error("❌ config.json is INVALID:");
  console.error(validate.errors);
  process.exit(1);
}