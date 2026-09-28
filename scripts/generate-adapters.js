const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

function loadTools() {
  const toolsPath = path.join(projectRoot, ".sdrive", "commands", "tools.json");

  if (!fs.existsSync(toolsPath)) {
    console.error("❌ tools.json not found.");
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(toolsPath, "utf8")).tools;
}

function adapterContent(toolName) {
  return `# SpecDrive Commands

This project uses SpecDrive for spec-driven development.

## How to use

When the user types a /sdrive:* command, follow these steps:

1. Read .sdrive/commands/manifest.json
2. Find the matching command
3. Read the agent file listed in agentFile
4. Follow that agent's instructions exactly
5. Run validators after writing files
6. Stop at human approval gates

Always read the manifest first. Never hardcode the command list.
`;
}

function generateForTools(tools) {
  tools.forEach((tool) => {
    const adapterFullPath = path.join(projectRoot, tool.adapterPath);
    const adapterDir = path.dirname(adapterFullPath);

    if (!fs.existsSync(adapterDir)) {
      fs.mkdirSync(adapterDir, { recursive: true });
    }

    if (fs.existsSync(adapterFullPath)) {
      console.log(`⚠️  Skipped existing: ${tool.adapterPath}`);
      return;
    }

    fs.writeFileSync(adapterFullPath, adapterContent(tool.name));
    console.log(`✅ Generated: ${tool.adapterPath}`);
  });
}

function generateAll() {
  const tools = loadTools();
  generateForTools(tools);
  console.log("\n🎉 All adapters generated successfully.");
}

function generateSelected(indexes) {
  const tools = loadTools();
  const selectedTools = indexes
    .map((i) => tools[i])
    .filter((tool) => tool);

  if (selectedTools.length === 0) {
    console.error("❌ No valid tools selected.");
    process.exit(1);
  }

  generateForTools(selectedTools);
  console.log("\n🎉 Selected adapters generated successfully.");
}

module.exports = {
  generateAll,
  generateSelected,
  loadTools
};

if (require.main === module) {
  generateAll();
}