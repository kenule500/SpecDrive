// Adapter tests.
//
// The old version of this file asserted `fs.existsSync(adapterPath)` and nothing
// else, which is why four adapters could point at files their tool never reads
// (a `.md` in `.gemini/commands`, a plain `.md` in `.cursor/rules`, `.qwen/rules/`,
// `.vscode/sdrive-commands.json`) while the suite stayed green. A file existing is
// not the same fact as a tool loading it, so these tests assert the *shape*:
// extension matches format, frontmatter is present where the tool demands it,
// shared paths are written once, and the registry itself validates.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = process.cwd();
const sdriveRoot = path.join(projectRoot, ".sdrive");
const generatorPath = path.join(sdriveRoot, "scripts", "generate-adapters.js");
const registryLib = require(path.join(sdriveRoot, "scripts", "lib", "tool-registry.js"));

function header(title) {
  console.log(`\n🧪 ${title}`);
}

function loadTools() {
  return registryLib.loadRegistry(sdriveRoot).tools;
}

function plannedWrites(tools) {
  return registryLib.planWrites(tools, projectRoot, registryLib.loadCommands(sdriveRoot));
}

// Recursively removes the files this test generated, then every directory that
// became empty - walking all the way up, because a command-set leaves a nested
// `.claude/commands/sdrive/` that would otherwise survive as an empty shell. The
// previous cleanup deleted files but left the directories, so every empty
// `.qwen/`, `.rovo/`, `.qoder/` in the repo was a fossil from a test run.
function cleanup(writes) {
  writes.forEach((write) => {
    if (fs.existsSync(write.absolutePath)) {
      fs.rmSync(write.absolutePath, { force: true });
    }
  });

  const directories = new Set();
  writes.forEach((write) => directories.add(path.dirname(write.absolutePath)));

  Array.from(directories)
    .sort((a, b) => b.length - a.length)
    .forEach((start) => {
      let directory = start;

      while (directory !== projectRoot && directory !== sdriveRoot && directory.length > projectRoot.length) {
        try {
          if (fs.readdirSync(directory).length > 0) break;
          fs.rmdirSync(directory);
        } catch (error) {
          break;
        }
        directory = path.dirname(directory);
      }
    });
}

function testRegistryValidates() {
  header("Test 1: registry validates");

  const tools = loadTools();
  const { errors, warnings } = registryLib.validateRegistry(tools);

  if (errors.length > 0) {
    errors.forEach((error) => console.log(`  ❌ ${error}`));
    return false;
  }

  warnings.forEach((warning) => console.log(`  ⚠️  ${warning}`));
  console.log(`  ✅ ${tools.length} tool(s) valid, ${warnings.length} unverified.`);
  return true;
}

function testFormatsMatchExtensions() {
  header("Test 2: every format matches its extension");

  const tools = loadTools();
  const checks = [];

  tools.forEach((tool) => {
    tool.paths.forEach((entry) => {
      // A command-set names a directory, so only file entries have an extension
      // to match. The "directory must not end with the extension" rule is
      // enforced by the registry validator.
      if (entry.kind === "command-set") return;

      if (!entry.path.endsWith(entry.extension)) {
        checks.push(`${tool.name}: ${entry.path} does not end with ${entry.extension}`);
      }
    });
  });

  if (checks.length > 0) {
    checks.forEach((check) => console.log(`  ❌ ${check}`));
    return false;
  }

  console.log("  ✅ Extension and format agree for every entry.");
  return true;
}

function testGeneratorCreatesEveryAdapter() {
  header("Test 3: generator writes every adapter");

  const tools = loadTools();
  const writes = plannedWrites(tools);

  try {
    // `stdio: "pipe"` is rejected outright by some sandboxes (EPERM on the pipe),
    // which would fail this test for reasons that have nothing to do with
    // adapters. The plan is asserted directly instead of scraping stdout.
    execSync(`node "${generatorPath}"`, { stdio: "ignore" });
  } catch (error) {
    console.log(`  ❌ FAIL: generator exited ${error.status}.`);
    return false;
  }

  const missing = writes.filter((write) => !fs.existsSync(write.absolutePath));

  if (missing.length > 0) {
    missing.forEach((write) => console.log(`  ❌ Missing: ${write.relativePath}`));
    return false;
  }

  console.log(`  ✅ All ${writes.length} file(s) written.`);

  // AGENTS.md is claimed by several tools; the plan must contain it exactly once,
  // with each of those tools listed against it.
  const uniquePaths = new Set(writes.map((write) => write.relativePath));

  if (uniquePaths.size !== writes.length) {
    console.log("  ❌ FAIL: the write plan contains duplicate paths.");
    return false;
  }

  const sharedWrites = writes.filter((write) => write.tools.length > 1);
  sharedWrites.forEach((write) =>
    console.log(`  ✅ ${write.relativePath} shared by ${write.tools.length} tool(s), planned once.`)
  );

  return true;
}

function testContentShape() {
  header("Test 4: content matches the format the tool parses");

  const tools = loadTools();
  const failures = [];

  plannedWrites(tools).forEach((write) => {
    if (!fs.existsSync(write.absolutePath)) {
      failures.push(`${write.relativePath}: missing`);
      return;
    }

    const content = fs.readFileSync(write.absolutePath, "utf8");
    const entry = tools
      .flatMap((tool) => tool.paths)
      .find((candidate) => registryLib.toPosix(candidate.path) === write.entryPath);

    if (!entry) {
      failures.push(`${write.relativePath}: no registry entry`);
      return;
    }

    if (entry.frontmatter) {
      if (!content.startsWith("---\n")) {
        failures.push(`${write.relativePath}: frontmatter required but missing`);
      } else if (entry.format === "mdc" && !content.includes("alwaysApply") && !content.includes("globs")) {
        failures.push(`${write.relativePath}: .mdc needs alwaysApply or globs`);
      }
    }

    if (write.format === "toml") {
      if (!content.includes("prompt = ")) {
        failures.push(`${write.relativePath}: TOML command needs a prompt field`);
      }
      if (content.trimStart().startsWith("#")) {
        failures.push(`${write.relativePath}: TOML cannot start with a Markdown heading`);
      }
    } else if (!content.includes(".sdrive/commands/manifest.json")) {
      failures.push(`${write.relativePath}: does not reference the command manifest`);
    }
  });

  if (failures.length > 0) {
    failures.forEach((failure) => console.log(`  ❌ ${failure}`));
    return false;
  }

  console.log("  ✅ All adapters have the shape their tool requires.");
  return true;
}

// The four adapters that used to be inert. A regression here silently removes a
// tool's support, which no other test would catch.
function testKnownToolShapes() {
  header("Test 5: tools that used to be silently unsupported");

  const tools = loadTools();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const failures = [];

  const gemini = byName.get("gemini-cli");
  if (!gemini || !gemini.paths.some((entry) => entry.format === "toml")) {
    failures.push("gemini-cli: needs a .toml command file (a .md there is ignored)");
  }
  if (!gemini || !gemini.paths.some((entry) => entry.path === "GEMINI.md")) {
    failures.push("gemini-cli: needs GEMINI.md as its context file");
  }

  const cursor = byName.get("cursor");
  if (!cursor || !cursor.paths.every((entry) => entry.format === "mdc")) {
    failures.push("cursor: rules must be .mdc (Cursor ignores plain .md in .cursor/rules)");
  }

  const qwen = byName.get("qwen-code");
  if (!qwen || !qwen.paths.some((entry) => entry.path === "QWEN.md")) {
    failures.push("qwen-code: needs QWEN.md");
  }

  const vscode = byName.get("vscode-native");
  if (!vscode || !vscode.paths.some((entry) => entry.path.endsWith(".instructions.md"))) {
    failures.push("vscode-native: needs .github/instructions/*.instructions.md");
  }

  if (!byName.has("agents-md")) {
    failures.push("agents-md: the AGENTS.md entry is missing");
  }

  if (failures.length > 0) {
    failures.forEach((failure) => console.log(`  ❌ ${failure}`));
    return false;
  }

  console.log("  ✅ Gemini, Cursor, Qwen, VS Code, and AGENTS.md all point at real files.");
  return true;
}

function testCommandSets() {
  header("Test 9: command-sets expand to one file per slash command");

  const tools = loadTools();
  const commands = registryLib.loadCommands(sdriveRoot);

  if (commands.length === 0) {
    console.log("  ⚠️  Skipped: no commands in the manifest.");
    return true;
  }

  const writes = plannedWrites(tools);
  const failures = [];
  const sets = tools.flatMap((tool) => tool.paths.filter((e) => e.kind === "command-set").map((entry) => ({ tool, entry })));

  if (sets.length === 0) {
    console.log("  ⚠️  Skipped: no command-set entries in the registry.");
    return true;
  }

  sets.forEach(({ tool, entry }) => {
    const prefix = `${registryLib.toPosix(entry.path)}/`;
    const files = writes.filter((write) => write.relativePath.startsWith(prefix));

    if (files.length !== commands.length) {
      failures.push(`${tool.name}: expected ${commands.length} command file(s), got ${files.length}`);
      return;
    }

    commands.forEach((command) => {
      const expected = registryLib.commandFilePath(entry, command);
      const write = writes.find((candidate) => candidate.relativePath === expected);

      if (!write) {
        failures.push(`${tool.name}: missing ${expected} for ${command.command}`);
        return;
      }

      if (!fs.existsSync(write.absolutePath)) {
        failures.push(`${expected}: not written`);
        return;
      }

      const content = fs.readFileSync(write.absolutePath, "utf8");
      const slug = registryLib.commandSlug(command);
      const fileName = path.posix.basename(expected);

      // The naming rule is the tool's namespacing contract, so assert the file
      // name directly instead of trusting commandFilePath to agree with itself.
      const expectedName = entry.naming === "nested" ? `${slug}${entry.extension}` : `sdrive-${slug}${entry.extension}`;
      if (fileName !== expectedName) {
        failures.push(`${expected}: file name should be ${expectedName} (${entry.naming} naming)`);
      }

      if (entry.format === "toml") {
        if (!content.includes('prompt = """')) failures.push(`${expected}: missing TOML prompt field`);
        if (!content.includes("{{args}}")) failures.push(`${expected}: missing {{args}} placeholder`);
      } else {
        if (!content.startsWith("---\ndescription:")) failures.push(`${expected}: missing description frontmatter`);
        if (!content.includes("$ARGUMENTS")) failures.push(`${expected}: missing $ARGUMENTS placeholder`);
      }

      if (!content.includes(command.agentFile)) {
        failures.push(`${expected}: does not name its agent file`);
      }
    });
  });

  if (failures.length > 0) {
    failures.slice(0, 12).forEach((failure) => console.log(`  ❌ ${failure}`));
    if (failures.length > 12) console.log(`  … and ${failures.length - 12} more`);
    return false;
  }

  console.log(`  ✅ ${sets.length} command-set(s) × ${commands.length} commands = ${sets.length * commands.length} files.`);
  return true;
}

function testNoOverwrite() {
  header("Test 6: generator does not overwrite existing files");

  const tools = loadTools();
  const writes = plannedWrites(tools);
  const target = writes.find((write) => write.relativePath === ".github/copilot-instructions.md") || writes[0];

  fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
  fs.writeFileSync(target.absolutePath, "# Custom existing file\n", "utf8");

  try {
    execSync(`node "${generatorPath}"`, { stdio: "ignore" });
  } catch (error) {
    console.log(`  ❌ FAIL: generator exited ${error.status}.`);
    return false;
  }

  const content = fs.readFileSync(target.absolutePath, "utf8");

  if (content !== "# Custom existing file\n") {
    console.log(`  ❌ FAIL: ${target.relativePath} was overwritten.`);
    return false;
  }

  console.log(`  ✅ ${target.relativePath} left untouched.`);
  return true;
}

function testVerifyCommand() {
  header("Test 7: `sdrive adapters:verify` accepts the shipped registry");

  const cliPath = path.join(projectRoot, "src", "index.js");

  if (!fs.existsSync(cliPath)) {
    console.log("  ⚠️  Skipped: running outside the SpecDrive repo.");
    return true;
  }

  try {
    execSync(`node "${cliPath}" adapters:verify`, { stdio: "ignore" });
    console.log("  ✅ adapters:verify exited 0.");
    return true;
  } catch (error) {
    console.log(`  ❌ adapters:verify exited ${error.status}.`);
    return false;
  }
}

function testBrokenRegistryIsRejected() {
  header("Test 8: a broken registry is rejected, not shipped");

  const tools = loadTools();
  const broken = tools.map((tool) =>
    registryLib.normalizeTool({
      name: tool.name,
      adapterPaths: tool.paths.map((entry) => ({ path: entry.path, format: "markdown", kind: entry.kind }))
    })
  );

  const { errors } = registryLib.validateRegistry(broken);

  if (errors.length === 0) {
    console.log("  ❌ FAIL: an unknown format was accepted.");
    return false;
  }

  console.log(`  ✅ Rejected with ${errors.length} error(s), as expected.`);
  return true;
}

function main() {
  console.log("=== SpecDrive Adapter Tests ===");

  const tools = loadTools();
  const writes = plannedWrites(tools);

  let allPassed = true;
  allPassed &= testRegistryValidates();
  allPassed &= testFormatsMatchExtensions();
  allPassed &= testGeneratorCreatesEveryAdapter();
  allPassed &= testContentShape();
  allPassed &= testKnownToolShapes();
  allPassed &= testCommandSets();
  allPassed &= testNoOverwrite();
  allPassed &= testVerifyCommand();
  allPassed &= testBrokenRegistryIsRejected();

  cleanup(writes);
  console.log("\n🧹 Cleaned up generated adapters and empty directories.");

  if (allPassed) {
    console.log("\n✅ All adapter tests passed.");
    process.exit(0);
  }

  console.log("\n❌ Some adapter tests failed.");
  process.exit(1);
}

main();
