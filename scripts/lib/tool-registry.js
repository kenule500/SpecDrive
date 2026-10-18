// Tool registry: the single source of truth for how SpecDrive speaks to each
// AI coding tool.
//
// One tool can need more than one file, and not every tool reads Markdown:
// Gemini CLI only loads `.toml` commands, Cursor ignores plain `.md` inside
// `.cursor/rules` (it needs `.mdc` plus frontmatter), and several tools share
// the same `AGENTS.md`. Modelling a tool as a single string path was what made
// four adapters silently inert, so a tool is now a list of `{ path, format,
// kind }` entries and generation dedupes by path.
//
// Everything here is pure and side-effect free except `writeAdapters` and
// `addTool`, so tests and `adapters:verify` can reason about the registry
// without touching the filesystem.

const fs = require("fs");
const path = require("path");

// File extension implied by each supported format. `format` is about the file
// a tool will actually parse, not a style preference.
const FORMAT_EXTENSION = {
  md: ".md",
  mdc: ".mdc",
  toml: ".toml"
};

const FORMATS = Object.keys(FORMAT_EXTENSION);
const KINDS = ["rules", "command"];

// The body every adapter carries. Tools differ in where they read instructions
// from; none of them differ in what SpecDrive tells them to do, so the body is
// shared and only the wrapper (frontmatter / TOML) is per format.
const STUB_BODY = `# SpecDrive Commands

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

// A tool entry is either the new shape (`adapterPaths`) or the legacy one
// (`adapterPath`). Projects initialized by older versions still carry the
// legacy shape, and `sdrive update` must not break them.
//
// `format` describes the *content syntax* (Markdown vs .mdc vs TOML) while
// `extension` describes the file name. They are usually the same thing, but not
// always: Zed reads Markdown from `.rules` and goose reads Markdown from
// `.goosehints`. Conflating the two is what would force a fake format called
// "rules", so they stay separate.
function normalizePath(entry) {
  const format = String(entry.format || "md").toLowerCase();
  const extension = String(entry.extension || FORMAT_EXTENSION[format] || "").toLowerCase();
  return {
    path: String(entry.path || ""),
    format,
    extension,
    kind: entry.kind || "rules",
    frontmatter: entry.frontmatter || null
  };
}

function normalizeTool(tool) {
  const rawPaths = Array.isArray(tool.adapterPaths)
    ? tool.adapterPaths
    : tool.adapterPath
    ? [{ path: tool.adapterPath, format: "md", kind: "rules" }]
    : [];

  return {
    name: String(tool.name || ""),
    label: tool.label || tool.name || "",
    mcpClient: tool.mcpClient || null,
    docs: tool.docs || "",
    // `verified` records whether the path was checked against the vendor's own
    // documentation. Unverified entries still generate (a best guess beats no
    // adapter) but `adapters:verify` warns about them so they cannot rot quietly
    // while looking as trustworthy as the rest.
    verified: tool.verified !== false,
    paths: rawPaths.map(normalizePath)
  };
}

function normalizeRegistry(registry) {
  const tools = Array.isArray(registry) ? registry : (registry && registry.tools) || [];
  return tools.map(normalizeTool);
}

function loadRegistry(sdriveRoot) {
  const registryPath = path.join(sdriveRoot, "commands", "tools.json");

  if (!fs.existsSync(registryPath)) {
    throw new Error(`Tool registry not found: ${registryPath}`);
  }

  return {
    registryPath,
    raw: JSON.parse(fs.readFileSync(registryPath, "utf8")),
    tools: normalizeRegistry(JSON.parse(fs.readFileSync(registryPath, "utf8")))
  };
}

// ---------- content ----------

function renderFrontmatter(frontmatter) {
  if (!frontmatter) return "";

  const lines = Object.entries(frontmatter).map(([key, value]) => {
    if (typeof value === "boolean" || typeof value === "number") {
      return `${key}: ${value}`;
    }
    // Glob-ish values such as `**` must stay quoted or YAML reads them as an
    // alias and the tool rejects the whole rule file.
    return `${key}: ${JSON.stringify(String(value))}`;
  });

  return `---\n${lines.join("\n")}\n---\n\n`;
}

// Gemini CLI custom commands are TOML with a required `prompt` field. A `.md`
// file in `.gemini/commands/` is ignored no matter what it contains.
function renderToml() {
  return [
    'description = "SpecDrive command router"',
    'prompt = """',
    STUB_BODY.trimEnd(),
    '"""',
    ""
  ].join("\n");
}

function renderContent(entry) {
  if (entry.format === "toml") return renderToml(entry);
  return `${renderFrontmatter(entry.frontmatter)}${STUB_BODY}`;
}

// ---------- validation ----------

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}

function validateRegistry(tools) {
  const errors = [];
  const warnings = [];
  const seenNames = new Set();
  const pathOwner = new Map();

  tools.forEach((tool) => {
    if (!tool.name) {
      errors.push("A tool entry is missing `name`.");
      return;
    }

    if (seenNames.has(tool.name)) {
      errors.push(`Duplicate tool name: ${tool.name}`);
    }
    seenNames.add(tool.name);

    if (tool.paths.length === 0) {
      errors.push(`${tool.name}: no adapter paths.`);
    }

    if (!tool.verified) {
      warnings.push(`${tool.name}: adapter path is unverified against vendor docs.`);
    }

    tool.paths.forEach((entry) => {
      const label = `${tool.name} → ${entry.path || "(empty)"}`;

      if (!entry.path) {
        errors.push(`${tool.name}: an adapter entry has an empty path.`);
        return;
      }

      if (path.isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes("..")) {
        errors.push(`${label}: adapter paths must be relative and stay inside the project.`);
      }

      if (!FORMATS.includes(entry.format)) {
        errors.push(`${label}: unknown format "${entry.format}" (expected ${FORMATS.join(", ")}).`);
        return;
      }

      const requiredExtension = entry.extension;
      if (!entry.path.toLowerCase().endsWith(requiredExtension)) {
        errors.push(`${label}: format "${entry.format}" requires a "${requiredExtension}" file.`);
      }

      if (!KINDS.includes(entry.kind)) {
        errors.push(`${label}: unknown kind "${entry.kind}" (expected ${KINDS.join(", ")}).`);
      }

      if (entry.format === "mdc" && !entry.frontmatter) {
        errors.push(`${label}: .mdc rules require frontmatter (Cursor ignores them otherwise).`);
      }

      if (entry.format === "toml" && entry.kind !== "command") {
        errors.push(`${label}: .toml adapters are command files; set "kind": "command".`);
      }

      if (entry.frontmatter && typeof entry.frontmatter !== "object") {
        errors.push(`${label}: frontmatter must be an object.`);
      }

      // Several tools genuinely share AGENTS.md. That is fine; what is not fine
      // is two entries disagreeing about what that one file contains.
      const signature = JSON.stringify({
        format: entry.format,
        kind: entry.kind,
        frontmatter: entry.frontmatter || null
      });

      if (pathOwner.has(entry.path)) {
        if (pathOwner.get(entry.path) !== signature) {
          errors.push(`${label}: another tool writes this path with a different format/kind.`);
        }
      } else {
        pathOwner.set(entry.path, signature);
      }
    });
  });

  return { errors, warnings };
}

// ---------- planning + writing ----------

// Deduplicates by path so selecting ten AGENTS.md-based tools writes one file.
function planWrites(tools, projectRoot) {
  const byPath = new Map();

  tools.forEach((tool) => {
    tool.paths.forEach((entry) => {
      const relativePath = toPosix(entry.path);

      if (byPath.has(relativePath)) {
        byPath.get(relativePath).tools.push(tool.name);
        return;
      }

      byPath.set(relativePath, {
        relativePath,
        absolutePath: path.join(projectRoot, entry.path),
        content: renderContent(entry),
        format: entry.format,
        kind: entry.kind,
        tools: [tool.name]
      });
    });
  });

  return Array.from(byPath.values());
}

/**
 * Writes every file the selected tools need.
 *
 * @returns {{written: string[], skipped: string[]}}
 */
function writeAdapters(tools, projectRoot, options = {}) {
  const { force = false, log = () => {} } = options;
  const written = [];
  const skipped = [];

  planWrites(tools, projectRoot).forEach((write) => {
    const dir = path.dirname(write.absolutePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(write.absolutePath) && !force) {
      skipped.push(write.relativePath);
      log(`⚠️  Skipped existing: ${write.relativePath}`);
      return;
    }

    fs.writeFileSync(write.absolutePath, write.content);
    written.push(write.relativePath);
    log(`✅ Generated: ${write.relativePath}`);
  });

  return { written, skipped };
}

// ---------- adding a tool at runtime ----------

/**
 * Appends a tool to the project's registry so any tool can be supported without
 * a SpecDrive release. Rejects names that already exist and paths that another
 * entry already owns with a different shape.
 */
function addTool(sdriveRoot, spec) {
  const registryPath = path.join(sdriveRoot, "commands", "tools.json");
  const raw = fs.existsSync(registryPath)
    ? JSON.parse(fs.readFileSync(registryPath, "utf8"))
    : { version: "1.0.0", tools: [] };

  const tools = normalizeRegistry(raw);

  if (tools.some((tool) => tool.name === spec.name)) {
    throw new Error(`Tool already registered: ${spec.name}`);
  }

  const format = String(spec.format || "md").toLowerCase();
  const entry = {
    path: spec.path,
    format,
    kind: spec.kind || (format === "toml" ? "command" : "rules")
  };

  if (spec.frontmatter) entry.frontmatter = spec.frontmatter;
  if (spec.extension) entry.extension = String(spec.extension).toLowerCase();

  const candidate = normalizeTool({
    name: spec.name,
    label: spec.label || spec.name,
    mcpClient: spec.mcpClient || null,
    docs: spec.docs || "",
    verified: spec.verified !== false,
    adapterPaths: [entry]
  });

  const { errors } = validateRegistry(tools.concat(candidate));

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  raw.tools = (raw.tools || []).concat({
    name: candidate.name,
    label: candidate.label,
    ...(candidate.mcpClient ? { mcpClient: candidate.mcpClient } : {}),
    ...(candidate.docs ? { docs: candidate.docs } : {}),
    ...(candidate.verified ? {} : { verified: false }),
    adapterPaths: [
      {
        path: entry.path,
        format: entry.format,
        kind: entry.kind,
        ...(entry.extension ? { extension: entry.extension } : {}),
        ...(entry.frontmatter ? { frontmatter: entry.frontmatter } : {})
      }
    ]
  });

  fs.writeFileSync(registryPath, `${JSON.stringify(raw, null, 2)}\n`);

  return candidate;
}

module.exports = {
  FORMAT_EXTENSION,
  FORMATS,
  KINDS,
  STUB_BODY,
  addTool,
  loadRegistry,
  normalizeRegistry,
  normalizeTool,
  planWrites,
  renderContent,
  toPosix,
  validateRegistry,
  writeAdapters
};
