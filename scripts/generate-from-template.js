const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

function loadTemplate(templateName, fileName) {
  const templatePath = path.join(projectRoot, ".sdrive", "templates", templateName, fileName);
  return fs.readFileSync(templatePath, "utf8");
}

function applyVariables(content, variables) {
  let result = content;
  Object.keys(variables).forEach((key) => {
    result = result.replaceAll(`{{${key}}}`, variables[key]);
  });
  return result;
}

function generate(templateName, featureName, variables) {
  const templateDir = path.join(projectRoot, ".sdrive", "templates", templateName);
  const govDir = path.join(projectRoot, ".sdrive", "governance", featureName);

  if (!fs.existsSync(templateDir)) {
    console.error(`❌ Template "${templateName}" not found.`);
    process.exit(1);
  }

  fs.mkdirSync(govDir, { recursive: true });

  const files = ["spec.json", "plan.json", "tasks.json"];

  files.forEach((file) => {
    const templateFile = path.join(templateDir, file);

    if (!fs.existsSync(templateFile)) {
      return;
    }

    let content = loadTemplate(templateName, file);
    content = applyVariables(content, {
      featureName,
      ...variables
    });

    fs.writeFileSync(path.join(govDir, file), content);
    console.log(`✅ Generated: ${featureName}/${file}`);
  });

  console.log(`\n🎉 Feature "${featureName}" generated from "${templateName}" template.`);
}

const templateName = process.argv[2];
const featureName = process.argv[3];
const problemStatement = process.argv[4] || "";
const proposedSolution = process.argv[5] || "";
const targetAudience = process.argv[6] || "";
const approach = process.argv[7] || "";
const flowDescription = process.argv[8] || "";

if (!templateName || !featureName) {
  console.error("❌ Usage: node generate-from-template.js <template> <feature> [problem] [solution] [audience] [approach] [flow]");
  process.exit(1);
}

generate(templateName, featureName, {
  problemStatement,
  proposedSolution,
  targetAudience,
  approach,
  flowDescription
});