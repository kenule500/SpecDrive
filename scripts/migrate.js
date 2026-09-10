#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

function migrateOpenSpec() {
  console.log("🔍 Looking for OpenSpec files...");

  const openspecDir = path.join(projectRoot, "openspec");

  if (!fs.existsSync(openspecDir)) {
    console.log("❌ openspec/ not found.");
    return false;
  }

  const specDir = path.join(openspecDir, "specs");

  if (!fs.existsSync(specDir)) {
    console.log("❌ openspec/specs not found.");
    return false;
  }

  console.log("✅ OpenSpec found. Migrating...");

  return true;
}

function migrateSpecKit() {
  console.log("🔍 Looking for Spec-Kit files...");

  const specKitDir = path.join(projectRoot, ".specify");

  if (!fs.existsSync(specKitDir)) {
    console.log("❌ .specify not found.");
    return false;
  }

  console.log("✅ Spec-Kit found. Migrating...");

  return true;
}

function main() {
  console.log("=== SpecDrive Migration Tool ===\n");

  let migrated = false;

  migrated = migrateOpenSpec() || migrated;
  migrated = migrateSpecKit() || migrated;

  if (migrated) {
    console.log("\n✅ Migration complete.");
    process.exit(0);
  } else {
    console.log("\n❌ No supported spec system found.");
    process.exit(1);
  }
}

main();