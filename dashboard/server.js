#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = process.cwd();
const sdriveRoot = path.join(projectRoot, ".sdrive");

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (error) {
    return "";
  }
}

function apiGitInfo() {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch) {
    return { available: false };
  }

  const commit = git(["rev-parse", "--short", "HEAD"]);
  const subject = git(["log", "-1", "--pretty=%s"]);
  const author = git(["log", "-1", "--pretty=%an"]);
  const committedAt = git(["log", "-1", "--pretty=%cI"]);
  const dirty = git(["status", "--porcelain"]).length > 0;

  // Determine the branch this one was merged from / branched off.
  // Prefer the upstream tracking branch, then the default branch, then the
  // most recent merged-in branch recorded in the reflog.
  let mergedFrom = "";
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (upstream && upstream !== branch) {
    mergedFrom = upstream.replace(/^origin\//, "");
  }

  if (!mergedFrom) {
    const defaultBranch = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
      .replace(/^origin\//, "");
    if (defaultBranch && defaultBranch !== branch) {
      mergedFrom = defaultBranch;
    }
  }

  if (!mergedFrom) {
    const reflog = git(["reflog", "--grep-reflog=merge", "--pretty=%gs", "-n", "1"]);
    const match = reflog.match(/merge\s+([^:]+):/);
    if (match) {
      mergedFrom = match[1].trim();
    }
  }

  const ahead = git(["rev-list", "--count", "@{upstream}..HEAD"]);
  const behind = git(["rev-list", "--count", "HEAD..@{upstream}"]);

  return {
    available: true,
    branch,
    commit,
    subject,
    author,
    committedAt,
    dirty,
    mergedFrom: mergedFrom || null,
    ahead: ahead ? parseInt(ahead, 10) : 0,
    behind: behind ? parseInt(behind, 10) : 0
  };
}

// List every local branch with its tip commit, author, and merge status so the
// Team & Branch page can show the full branch landscape alongside members.
function apiBranches() {
  const current = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const raw = git([
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname:short)%09%(objectname:short)%09%(committerdate:iso-strict)%09%(authorname)%09%(subject)",
    "refs/heads"
  ]);

  if (!raw) {
    return { available: false, current: current || null, branches: [] };
  }

  // Branches already merged into the default branch (main/master).
  const defaultBranch = (git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]) || "")
    .replace(/^origin\//, "") || "main";
  const mergedRaw = git(["branch", "--merged", defaultBranch, "--format=%(refname:short)"]);
  const mergedSet = new Set(
    mergedRaw.split("\n").map((b) => b.trim()).filter(Boolean)
  );

  const branches = raw
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 5 && parts[0])
    .map(([name, commit, committedAt, author, subject]) => ({
      name,
      commit,
      committedAt,
      author,
      subject,
      current: name === current,
      merged: mergedSet.has(name)
    }));

  return {
    available: true,
    current: current || null,
    defaultBranch,
    branches
  };
}

function loadJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

// The dashboard is launched from the project root, so the folder name is the
// project name (e.g. "allymagax"). Surfaced in the sidebar and topbar so it is
// obvious which project a dashboard belongs to when several are running.
function apiProjectInfo() {
  const name = path.basename(projectRoot) || "project";
  return { name, root: projectRoot };
}

// Classify the project so the dashboard can tell the user which workflow they
// are on. Greenfield = built from scratch with SpecDrive; brownfield = an
// existing codebase adopted via onboarding. We prefer the explicit onboarding
// record, then fall back to heuristics (existing source + no onboarding record
// means it was almost certainly adopted).
function apiProductType() {
  const state = loadJson(path.join(sdriveRoot, "workflow-state.json"), {});
  const onboarding = state.onboarding || null;

  const hasConstitution = fs.existsSync(path.join(sdriveRoot, "constitution.md"));
  const hasProductPlan = fs.existsSync(path.join(sdriveRoot, "product", "overview.md"));
  const featureCount = Array.isArray(state.features) ? state.features.length : 0;

  // Heuristic: a project with source code but no onboarding record predates
  // SpecDrive, i.e. it was adopted (brownfield).
  const sourceDirs = ["app", "src", "components", "lib", "pages", "server"];
  const hasSource = sourceDirs.some((dir) => fs.existsSync(path.join(projectRoot, dir)));

  let type = "unknown";
  let source = "heuristic";

  if (onboarding && onboarding.mode) {
    type = onboarding.mode;
    source = "onboarding record";
  } else if (hasSource) {
    type = "brownfield";
  } else {
    type = "greenfield";
  }

  const meta = {
    greenfield: {
      label: "Greenfield",
      tagline: "Built from scratch",
      description:
        "A brand-new project started inside SpecDrive. Every feature is specified before it is built, so the spec and the code stay in lockstep from day one.",
      icon: "✦"
    },
    brownfield: {
      label: "Brownfield",
      tagline: "Adopted existing code",
      description:
        "An existing codebase brought under SpecDrive governance. Existing work is inventoried, retroactive specs are generated, and gaps are marked as deferred instead of breaking anything.",
      icon: "◈"
    },
    unknown: {
      label: "Unclassified",
      tagline: "Not yet determined",
      description:
        "SpecDrive has not recorded how this project started. Run onboarding or the constitution step to classify it.",
      icon: "○"
    }
  }[type];

  return {
    type,
    source,
    label: meta.label,
    tagline: meta.tagline,
    description: meta.description,
    icon: meta.icon,
    signals: {
      onboarding: Boolean(onboarding),
      onboardingDate: onboarding?.date || null,
      constitution: hasConstitution,
      productPlan: hasProductPlan,
      features: featureCount,
      existingSource: hasSource
    }
  };
}

function apiWorkflowState() {
  return loadJson(path.join(sdriveRoot, "workflow-state.json"), { features: [] });
}

function apiAuditLog() {
  return loadJson(path.join(sdriveRoot, "audit-log.json"), { events: [] });
}

// The Activity page is fed from two sources:
//   1. .sdrive/audit-log.json  (explicit governance events, if the project has one)
//   2. workflow-state.json history (every feature/version records its own timeline)
// Most projects never create audit-log.json, so without the second source the
// Activity page would always be empty. We merge both, newest first.
function apiActivity() {
  const events = [];

  const log = loadJson(path.join(sdriveRoot, "audit-log.json"), { events: [] });
  (log.events || []).forEach((e) => {
    events.push({
      event: e.event || "event",
      timestamp: e.timestamp || null,
      feature: e.feature || "",
      version: e.version || "",
      details: e.details || {},
      source: "audit-log"
    });
  });

  const state = loadJson(path.join(sdriveRoot, "workflow-state.json"), { features: [] });
  (state.features || []).forEach((feature) => {
    (feature.versions || []).forEach((version) => {
      (version.history || []).forEach((h) => {
        events.push({
          event: h.event || "event",
          timestamp: h.timestamp || null,
          feature: feature.name || "",
          version: version.id || "",
          details: {},
          source: "workflow-state"
        });
      });
    });
  });

  events.sort((a, b) => {
    const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
    const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
    return tb - ta;
  });

  return { events };
}

// Skills live at .sdrive/skills/<name>/SKILL.md with YAML frontmatter.
// We parse the frontmatter (name, description, version, tags, source, license,
// last_updated) plus a rough size/line count so the dashboard can show what
// guidance the project has provisioned.
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      value = value.replace(/^["']|["']$/g, "");
    }
    meta[key] = value;
  }
  return meta;
}

function apiSkills() {
  const skillsDir = path.join(sdriveRoot, "skills");
  if (!fs.existsSync(skillsDir)) {
    return { exists: false, skills: [] };
  }

  const skills = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;

    let content = "";
    try {
      content = fs.readFileSync(skillFile, "utf8");
    } catch (error) {
      continue;
    }

    const meta = parseFrontmatter(content);
    const lines = content.split(/\r?\n/).length;

    // Count optional supporting files (examples/, references/, etc.)
    let extraFiles = 0;
    try {
      const walk = (dir) => {
        for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
          if (child.isDirectory()) walk(path.join(dir, child.name));
          else if (child.name !== "SKILL.md") extraFiles += 1;
        }
      };
      walk(path.join(skillsDir, entry.name));
    } catch (error) {
      /* ignore */
    }

    // A skill may ship its own logo. We look for a conventional filename in the
    // skill folder (and an optional assets/ subfolder) so the dashboard can show
    // the real brand mark instead of the generic gradient icon.
    const logo = findSkillLogo(path.join(skillsDir, entry.name));

    skills.push({
      name: meta.name || entry.name,
      folder: entry.name,
      description: meta.description || "",
      version: meta.version || "",
      lastUpdated: meta.last_updated || "",
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      source: meta.source || "",
      license: meta.license || "",
      installed: meta.installed || "",
      logo: logo ? `/api/skill-logo/${encodeURIComponent(entry.name)}` : "",
      lines,
      extraFiles
    });
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { exists: true, skills };
}

// Conventional logo filenames, checked in order. The first match wins.
const SKILL_LOGO_NAMES = [
  "logo.svg",
  "logo.png",
  "logo.webp",
  "logo.jpg",
  "logo.jpeg",
  "icon.svg",
  "icon.png",
  "icon.webp",
  "icon.jpg",
  "icon.jpeg"
];

const SKILL_LOGO_TYPES = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

// Returns the absolute path to a skill's logo, or null if none is present.
// Looks in the skill root and an optional assets/ subfolder.
function findSkillLogo(skillDir) {
  const searchDirs = [skillDir, path.join(skillDir, "assets")];
  for (const dir of searchDirs) {
    for (const name of SKILL_LOGO_NAMES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// Serves a skill's logo by folder name. The folder is validated against the
// skills directory listing so a crafted path cannot escape the skills root.
function serveSkillLogo(res, folder) {
  const skillsDir = path.join(sdriveRoot, "skills");
  const skillDir = path.join(skillsDir, folder);

  // Guard against path traversal: the resolved dir must sit directly under skills/.
  const resolved = path.resolve(skillDir);
  if (path.dirname(resolved) !== path.resolve(skillsDir)) {
    res.writeHead(400);
    return res.end("Bad request");
  }

  const logoPath = findSkillLogo(resolved);
  if (!logoPath) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const type = SKILL_LOGO_TYPES[path.extname(logoPath).toLowerCase()] || "application/octet-stream";
  return serveStatic(res, logoPath, type);
}

function apiTeam() {
  return loadJson(path.join(sdriveRoot, "team.json"), { members: [] });
}

// Governance files may live in either layout:
//   versioned: .sdrive/governance/<feature>/<version>/<file>
//   legacy:    .sdrive/governance/<feature>/<file>
// Resolve the versioned path first, then fall back to the flat legacy path so
// projects created before versioned governance still render correctly.
function governanceFile(feature, version, fileName) {
  const versioned = path.join(sdriveRoot, "governance", feature, version, fileName);
  if (fs.existsSync(versioned)) return versioned;
  const legacy = path.join(sdriveRoot, "governance", feature, fileName);
  if (fs.existsSync(legacy)) return legacy;
  return versioned;
}

function apiTraceability(feature, version) {
  return loadJson(governanceFile(feature, version, "traceability.json"), { rows: [] });
}

// Execution tasks for a feature version. Tasks are grouped into phases, and
// each task links back to the requirements it satisfies. The dashboard uses
// this to show pending/completed counts and the full task breakdown.
function apiTasks(feature, version) {
  const data = loadJson(governanceFile(feature, version, "tasks.json"), {
    feature,
    version: Number(version) || 1,
    phases: []
  });

  const phases = Array.isArray(data.phases) ? data.phases : [];
  let total = 0;
  let completed = 0;

  const shaped = phases.map((phase) => {
    const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
    const done = tasks.filter((t) => t.completed === true).length;
    total += tasks.length;
    completed += done;
    return {
      phaseId: phase.phaseId || "",
      name: phase.name || "",
      dependencies: phase.dependencies || [],
      total: tasks.length,
      completed: done,
      tasks: tasks.map((t) => ({
        id: t.id || "",
        title: t.title || "",
        description: t.description || "",
        linkedRequirements: t.linkedRequirements || [],
        linkedAcceptanceCriteria: t.linkedAcceptanceCriteria || [],
        completed: t.completed === true
      }))
    };
  });

  return {
    feature: data.feature || feature,
    version: data.version || Number(version) || 1,
    summary: {
      total,
      completed,
      pending: total - completed,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100)
    },
    phases: shaped
  };
}

function apiVerification(feature, version) {
  return loadJson(governanceFile(feature, version, "verification.json"), {
    status: "not_run",
    summary: {},
    items: {}
  });
}

function apiTestReport(feature, version) {
  const reportDir = path.join(sdriveRoot, "reports", "tests");

  if (!fs.existsSync(reportDir)) {
    return { status: "not_run", summary: {}, tests: [] };
  }

  const files = fs.readdirSync(reportDir)
    .filter((f) => f.startsWith(`test-report-${feature}-${version}-`))
    .sort()
    .reverse();

  if (files.length === 0) {
    return { status: "not_run", summary: {}, tests: [] };
  }

  const latest = path.join(reportDir, files[0]);
  const content = fs.readFileSync(latest, "utf8");

  const totalMatch = content.match(/Total ACs:\*\*\s*(\d+)/);
  const testedMatch = content.match(/Tested ACs:\*\*\s*(\d+)/);
  const coverageMatch = content.match(/Coverage:\*\*\s*(\d+)/);
  const passedMatch = content.match(/Tests Passed:\*\*\s*(\d+)\/(\d+)/);

  return {
    status:
      testedMatch && totalMatch && testedMatch[1] === totalMatch[1]
        ? "complete"
        : "partial",
    file: files[0],
    summary: {
      totalACs: totalMatch ? parseInt(totalMatch[1]) : 0,
      testedACs: testedMatch ? parseInt(testedMatch[1]) : 0,
      coverage: coverageMatch ? parseInt(coverageMatch[1]) : 0,
      passed: passedMatch ? parseInt(passedMatch[1]) : 0,
      total: passedMatch ? parseInt(passedMatch[2]) : 0
    }
  };
}

// Report types produced by the agents. Each agent writes to
// .sdrive/reports/<dir>/ using the filename pattern
// <prefix>-report-<feature>-<version>-<date>.md (or -all-<date>.md).
// The dashboard surfaces whichever of these exist for a feature.
const REPORT_TYPES = [
  { id: "tests", dir: "tests", prefix: "test", label: "Tests" },
  { id: "performance", dir: "performance", prefix: "performance", label: "Performance" },
  { id: "security", dir: "security", prefix: "security", label: "Security" },
  { id: "reviews", dir: "reviews", prefix: "review", label: "Review" },
  { id: "docs", dir: "docs", prefix: "coverage", label: "Documentation" },
  { id: "debug", dir: "debug", prefix: "debug", label: "Debug" }
];

// Read the first markdown heading of a report so the UI can show a title
// without shipping the whole file. Falls back to null when absent.
function readReportTitle(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  } catch (error) {
    return null;
  }
}

// Extract a "Status: PASS" / "**Status:** PASS" style verdict if present.
function readReportStatus(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(/\*{0,2}Status:?\*{0,2}\s*:?\s*\*{0,2}\s*(PASS|FAIL|PASSED|FAILED|CLEAN|IMPROVED|REGRESSED)/i);
    return match ? match[1].toUpperCase() : null;
  } catch (error) {
    return null;
  }
}

// Collect every report for a feature across all report types.
// Feature-scoped reports are matched by "<prefix>-report-<feature>-<version>-".
// Global reports (e.g. debug-report-all-<date>.md) are matched separately and
// flagged so the UI can distinguish them.
function apiReports(feature, version) {
  const reportsRoot = path.join(sdriveRoot, "reports");
  const types = [];

  for (const type of REPORT_TYPES) {
    const dir = path.join(reportsRoot, type.dir);
    if (!fs.existsSync(dir)) {
      types.push({ id: type.id, label: type.label, status: "missing", reports: [] });
      continue;
    }

    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    } catch (error) {
      files = [];
    }

    const scoped = files
      .filter((f) => f.startsWith(`${type.prefix}-report-${feature}-${version}-`))
      .sort()
      .reverse();

    const global = files
      .filter((f) => f.startsWith(`${type.prefix}-report-all-`))
      .sort()
      .reverse();

    const reports = [];

    if (scoped.length) {
      const latest = scoped[0];
      const full = path.join(dir, latest);
      reports.push({
        file: latest,
        scope: "feature",
        date: latest.replace(/\.md$/, "").split("-").slice(-3).join("-"),
        title: readReportTitle(full),
        status: readReportStatus(full),
        history: scoped.length
      });
    }

    if (global.length) {
      const latest = global[0];
      const full = path.join(dir, latest);
      reports.push({
        file: latest,
        scope: "all",
        date: latest.replace(/\.md$/, "").split("-").slice(-3).join("-"),
        title: readReportTitle(full),
        status: readReportStatus(full),
        history: global.length
      });
    }

    types.push({
      id: type.id,
      label: type.label,
      status: reports.length ? "present" : "missing",
      reports
    });
  }

  return { feature, version, types };
}

function parseFeatureVersion(url) {
  // Strip the query string, then drop the leading "/api/<resource>" segments so
  // only the feature/version tail remains. Without this, "/api/reports/foo"
  // would yield feature="reports", version="foo".
  const clean = url.split("?")[0];
  const parts = clean.split("/").filter(Boolean);
  const tail = parts.slice(2);
  return {
    feature: tail.length >= 2 ? tail[tail.length - 2] : tail[0],
    version: tail.length >= 2 ? tail[tail.length - 1] : null
  };
}

// Spec documents live under .sdrive/specs/<stage>/<feature>/<version>/.
// A feature moves from backlog -> ongoing -> completed, so we search every
// stage and return the first folder that actually holds the version. This lets
// the dashboard read the raw spec/plan/tasks/traceability markdown without the
// user having to open the repo.
const SPEC_STAGES = ["ongoing", "completed", "backlog"];
const SPEC_DOCS = [
  { id: "spec", label: "Specification", file: "spec.md" },
  { id: "plan", label: "Plan", file: "plan.md" },
  { id: "tasks", label: "Tasks", file: "tasks.md" },
  { id: "traceability", label: "Traceability", file: "traceability.md" },
  { id: "review", label: "Review", file: "review.md" }
];

function resolveSpecDir(feature, version) {
  for (const stage of SPEC_STAGES) {
    const dir = path.join(sdriveRoot, "specs", stage, feature, version);
    if (fs.existsSync(dir)) return { stage, dir };
  }
  return { stage: null, dir: null };
}

// Returns the raw markdown for every spec document that exists for a feature
// version, plus which stage (ongoing/completed/backlog) it was found in.
function apiSpecFiles(feature, version) {
  const { stage, dir } = resolveSpecDir(feature, version);

  if (!dir) {
    return { feature, version, stage: null, docs: [] };
  }

  const docs = [];
  for (const doc of SPEC_DOCS) {
    const full = path.join(dir, doc.file);
    if (!fs.existsSync(full)) continue;
    let content = "";
    try {
      content = fs.readFileSync(full, "utf8");
    } catch (error) {
      content = "";
    }
    docs.push({
      id: doc.id,
      label: doc.label,
      file: doc.file,
      path: `.sdrive/specs/${stage}/${feature}/${version}/${doc.file}`,
      bytes: Buffer.byteLength(content, "utf8"),
      lines: content ? content.split(/\r?\n/).length : 0,
      content
    });
  }

  return { feature, version, stage, docs };
}

function serveStatic(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "Content-Type": contentType });
  res.end(fs.readFileSync(filePath));
}

function apiOnboarding() {
  const state = loadJson(path.join(sdriveRoot, "workflow-state.json"), { features: [] });
  return state.onboarding || null;
}

function readProductFile(fileName) {
  const filePath = path.join(sdriveRoot, "product", fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return null;
  }
}

function parseBacklog(markdown) {
  if (!markdown) return [];

  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length < 3) continue;
    if (/^id$/i.test(cells[0])) continue;

    // Backlog table columns: ID | Feature | Milestone | Priority | Dependencies | Status
    // Older/simpler tables may only have: ID | Feature | Status
    const hasFullColumns = cells.length >= 6;
    rows.push({
      id: cells[0],
      feature: cells[1],
      milestone: hasFullColumns ? cells[2] : "",
      priority: hasFullColumns ? cells[3] : "",
      dependencies: hasFullColumns ? cells[4] : "",
      status: hasFullColumns ? cells[5] : cells[2]
    });
  }

  return rows;
}

function apiProduct() {
  const overview = readProductFile("overview.md");
  const mockup = readProductFile("mockup.md");
  const designSystem = readProductFile("design-system.md");
  const roadmap = readProductFile("roadmap.md");
  const backlogMarkdown = readProductFile("backlog.md");

  const exists = Boolean(overview || mockup || designSystem || roadmap || backlogMarkdown);

  return {
    exists,
    overview,
    mockup,
    designSystem,
    roadmap,
    backlog: parseBacklog(backlogMarkdown),
    summary: parseProductOverview(overview)
  };
}

// Pull the high-signal sections out of product/overview.md so the Overview page
// can show vision, goals, target users, tech stack, and languages without
// dumping the whole markdown file.
function parseProductOverview(markdown) {
  if (!markdown) return null;

  const lines = markdown.split(/\r?\n/);
  const sections = {};
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }

  const findSection = (needle) => {
    const key = Object.keys(sections).find((k) => k.includes(needle));
    return key ? sections[key].join("\n").trim() : "";
  };

  const bullets = (text) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l))
      .map((l) => l.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").trim());

  const tableRows = (text) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && !/^\|[\s:|-]+\|$/.test(l))
      .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
      .filter((cells) => cells.length && !/^segment$/i.test(cells[0]));

  const titleMatch = markdown.match(/^#\s+(.*)$/m);
  const statusMatch = markdown.match(/Status:\s*([^·\n]+)/i);

  return {
    title: titleMatch ? titleMatch[1].trim() : "",
    status: statusMatch ? statusMatch[1].trim() : "",
    vision: findSection("vision"),
    problem: findSection("problem"),
    goals: bullets(findSection("goals")),
    nonGoals: bullets(findSection("non-goals")),
    targetUsers: tableRows(findSection("target users")).map((cells) => ({
      segment: cells[0] || "",
      description: cells[1] || "",
      need: cells[2] || ""
    })),
    guidance: bullets(findSection("confirmed guidance")),
    architecture: bullets(findSection("existing architecture")),
    openQuestions: bullets(findSection("open questions"))
  };
}

// Static CLI command reference. Kept in sync with src/index.js.
// Each entry carries plain-language fields so a non-technical reader can
// understand what the command does, why it exists, and when to reach for it.
const CLI_COMMANDS = [
  { command: "sdrive init", description: "Initialize SpecDrive structure, tool adapters, and MCP wiring", group: "Setup",
    what: "Sets up SpecDrive inside your project for the first time.",
    why: "Creates the folders, config, and AI-tool connections SpecDrive needs to work.",
    when: "Once, at the very start of a new project.",
    example: "sdrive init" },
  { command: "sdrive update", description: "Refresh framework files (dashboard, mcp, scripts, schemas) without touching specs or governance", group: "Setup",
    what: "Updates SpecDrive's own files to the latest version.",
    why: "You get new dashboard and tooling improvements without losing your specs or approvals.",
    when: "After upgrading the SpecDrive package.",
    example: "sdrive update" },
  { command: "sdrive onboard", description: "Scan an existing project for onboarding (usually run by /sdrive:onboard)", group: "Setup",
    what: "Reads an existing codebase and builds an inventory of what is already there.",
    why: "Lets you adopt SpecDrive into a project that already has code, without starting over.",
    when: "When bringing an existing project under SpecDrive.",
    example: "sdrive onboard" },
  { command: "sdrive config:validate", description: "Validate .sdrive/config.json", group: "Setup",
    what: "Checks that your SpecDrive configuration file is correct.",
    why: "Catches typos or missing settings before they cause confusing failures.",
    when: "After editing .sdrive/config.json.",
    example: "sdrive config:validate" },
  { command: "sdrive template:list", description: "List available templates", group: "Setup",
    what: "Shows the document templates SpecDrive can use.",
    why: "Helps you pick the right starting point for your specs.",
    when: "When choosing how specs should be formatted.",
    example: "sdrive template:list" },
  { command: "sdrive template:set <name>", description: "Set the default template", group: "Setup",
    what: "Chooses which template SpecDrive uses by default.",
    why: "Keeps every new spec consistent with your team's preferred format.",
    when: "Once, when configuring your project.",
    example: "sdrive template:set standard" },
  { command: "sdrive hooks:install", description: "Install the SpecDrive pre-commit hook", group: "Setup",
    what: "Adds an automatic check that runs before each Git commit.",
    why: "Stops invalid or unapproved changes from being committed by accident.",
    when: "Once, after initializing SpecDrive.",
    example: "sdrive hooks:install" },

  { command: "sdrive create <feature>", description: "Create a new feature scaffold (internal)", group: "Features",
    what: "Creates the empty folder structure for a new feature.",
    why: "Gives every feature the same organised home for its spec, plan, and tasks.",
    when: "Usually run for you by /sdrive:propose.",
    example: "sdrive create user-login" },
  { command: "sdrive status", description: "Show feature lifecycle state", group: "Features",
    what: "Prints where each feature currently stands.",
    why: "A quick way to see what is in progress, blocked, or done.",
    when: "Any time you want a status check.",
    example: "sdrive status" },
  { command: "sdrive version:new <feature>", description: "Create a new version of a feature", group: "Features",
    what: "Starts a fresh version of an existing feature.",
    why: "Lets you evolve a shipped feature without erasing its history.",
    when: "When adding significant new scope to a completed feature.",
    example: "sdrive version:new user-login" },
  { command: "sdrive reopen <feature>", description: "Reopen a completed feature", group: "Features",
    what: "Moves a finished feature back into active work.",
    why: "Handles the reality that 'done' features sometimes need more work.",
    when: "When a completed feature needs changes.",
    example: "sdrive reopen user-login" },
  { command: "sdrive diff:version <feature> <a> <b>", description: "Compare two versions of a feature", group: "Features",
    what: "Shows what changed between two versions of a feature.",
    why: "Makes it easy to review scope changes over time.",
    when: "Before approving a new version.",
    example: "sdrive diff:version user-login v1 v2" },

  { command: "sdrive validate", description: "Validate SpecDrive governance files", group: "Governance",
    what: "Checks that all your spec and governance files are well-formed.",
    why: "Catches broken or incomplete documents before they block the workflow.",
    when: "Before approving a gate or merging.",
    example: "sdrive validate" },
  { command: "sdrive verify <feature>", description: "Verify code matches the plan (spec-to-code diff)", group: "Governance",
    what: "Compares what was specified against what was actually built.",
    why: "Proves the code matches the approved plan — no missing or surprise work.",
    when: "Before the review gate.",
    example: "sdrive verify user-login" },
  { command: "sdrive approve <gate>", description: "Approve a workflow gate (specification, planning, implementation, review)", group: "Governance",
    what: "Signs off on one of the four approval checkpoints.",
    why: "Gates are how a human confirms each stage is genuinely ready to advance.",
    when: "After reviewing a stage's output.",
    example: "sdrive approve specification" },
  { command: "sdrive diff <oldFile> <newFile>", description: "Show differences between two spec files", group: "Governance",
    what: "Highlights what changed between two documents.",
    why: "Speeds up review by focusing attention on the differences.",
    when: "When comparing spec revisions.",
    example: "sdrive diff old.json new.json" },
  { command: "sdrive openapi:generate <feature>", description: "Generate an OpenAPI spec from plan.json API contracts", group: "Governance",
    what: "Turns your planned API contracts into a standard OpenAPI document.",
    why: "Keeps API documentation in sync with the plan automatically.",
    when: "After the plan defines API endpoints.",
    example: "sdrive openapi:generate user-login" },

  { command: "sdrive team:add <username> <role>", description: "Add a new team member", group: "Team",
    what: "Registers a person and their role on the project.",
    why: "Tracks who is accountable for what.",
    when: "When someone joins the project.",
    example: "sdrive team:add jane developer" },
  { command: "sdrive team:remove <username>", description: "Remove a team member", group: "Team",
    what: "Removes a person from the project roster.",
    why: "Keeps the team list accurate as people move on.",
    when: "When someone leaves the project.",
    example: "sdrive team:remove jane" },
  { command: "sdrive team:list", description: "List all team members", group: "Team",
    what: "Shows everyone on the project and their roles.",
    why: "A single source of truth for who is involved.",
    when: "Any time you need the roster.",
    example: "sdrive team:list" },
  { command: "sdrive team:update <username> <role>", description: "Update a team member's role", group: "Team",
    what: "Changes a person's role.",
    why: "Keeps responsibilities current as people grow.",
    when: "When someone's role changes.",
    example: "sdrive team:update jane lead" },
  { command: "sdrive team:sync", description: "Sync team members from GitHub collaborators", group: "Team",
    what: "Pulls the contributor list straight from GitHub.",
    why: "Avoids manually re-typing who is on the project.",
    when: "After adding collaborators on GitHub.",
    example: "sdrive team:sync" },

  { command: "sdrive dashboard", description: "Start the SpecDrive web dashboard", group: "Dashboard",
    what: "Opens the visual dashboard in your browser.",
    why: "Gives you a friendly view of features, gates, and progress.",
    when: "Whenever you want to see the big picture.",
    example: "sdrive dashboard" }
];

// Plain-language descriptions for the slash commands, keyed by command name.
// The manifest holds the terse machine description; these are the human ones.
const SLASH_DETAILS = {
  "/sdrive:constitution": {
    what: "Establishes the project's ground rules and context.",
    why: "Every later decision is checked against this shared foundation.",
    when: "First, before any feature work.",
    does: [
      "Interviews you about the product, stack, and constraints",
      "Merges the answers into a single constitution document",
      "Assigns stable IDs to every principle so later work can cite them"
    ],
    produces: [
      ".sdrive/constitution.md",
      ".sdrive/context/ (product, stack, constraints)"
    ],
    reads: ["Your answers", "Existing repo files (brownfield)"],
    handsOff: "/sdrive:product-plan"
  },
  "/sdrive:product-plan": {
    what: "Creates the product overview, mockup, roadmap, and feature backlog.",
    why: "Gives the whole team a shared picture of what is being built and why.",
    when: "Early, once the constitution exists.",
    does: [
      "Drafts the product overview and positioning",
      "Produces a UI mockup and roadmap",
      "Breaks the roadmap into a prioritised feature backlog"
    ],
    produces: [
      ".sdrive/product/overview.md",
      ".sdrive/product/mockup.html",
      ".sdrive/product/roadmap.md",
      ".sdrive/product/backlog.md"
    ],
    reads: [".sdrive/constitution.md"],
    handsOff: "/sdrive:propose"
  },
  "/sdrive:propose": {
    what: "Turns an idea into a full specification, plan, and task list.",
    why: "Nothing gets built until it is clearly specified and approved.",
    when: "When starting a new feature.",
    does: [
      "Writes the feature specification with numbered requirements",
      "Derives acceptance criteria and a traceability matrix",
      "Produces a technical plan and an ordered task list",
      "Opens a feature branch for the work"
    ],
    produces: [
      ".sdrive/specs/ongoing/<feature>/<version>/spec.md",
      ".sdrive/specs/ongoing/<feature>/<version>/plan.md",
      ".sdrive/specs/ongoing/<feature>/<version>/tasks.md",
      ".sdrive/specs/ongoing/<feature>/<version>/traceability.md",
      ".sdrive/governance/<feature>/<version>/*.json"
    ],
    reads: [".sdrive/constitution.md", ".sdrive/product/backlog.md"],
    handsOff: "/sdrive:apply"
  },
  "/sdrive:update-propose": {
    what: "Extends an existing specification with new requirements.",
    why: "Lets features grow without rewriting their history.",
    when: "When scope changes on an existing feature.",
    does: [
      "Adds new requirements without renumbering existing ones",
      "Updates the plan and task list to cover the additions",
      "Refreshes the traceability matrix"
    ],
    produces: [
      "Updated spec.md, plan.md, tasks.md, traceability.md",
      "Updated governance JSON for the version"
    ],
    reads: ["The existing feature spec and governance"],
    handsOff: "/sdrive:apply"
  },
  "/sdrive:design": {
    what: "Builds the UI/UX prototype and design system.",
    why: "Agrees on the look and feel before code is written.",
    when: "After the spec, before implementation.",
    does: [
      "Produces an interactive HTML/CSS/JS prototype",
      "Defines the design tokens and component inventory",
      "Maps every screen back to its requirements"
    ],
    produces: [
      ".sdrive/design/<feature>/prototype.html",
      ".sdrive/design/<feature>/design-system.md"
    ],
    reads: ["The feature spec and acceptance criteria"],
    handsOff: "/sdrive:apply"
  },
  "/sdrive:sync": {
    what: "Keeps the spec, plan, tasks, and traceability in agreement.",
    why: "Prevents documents from drifting out of sync as things change.",
    when: "After any change to the spec or plan.",
    does: [
      "Diffs the spec against the plan, tasks, and traceability",
      "Repairs mismatched IDs and orphaned references",
      "Reports anything it could not reconcile"
    ],
    produces: ["Updated spec, plan, tasks, and traceability files"],
    reads: ["Every document in the feature's version folder"],
    handsOff: "/sdrive:apply"
  },
  "/sdrive:skills": {
    what: "Audits and manages the AI skills available to the project.",
    why: "Keeps the AI's capabilities current and trustworthy.",
    when: "Periodically, or when adding new tooling.",
    does: [
      "Inventories the skills currently available",
      "Verifies each skill against its source",
      "Discovers and proposes new skills from GitHub"
    ],
    produces: [".sdrive/skills/ (skill workspace and audit notes)"],
    reads: ["The project's skill configuration"],
    handsOff: "Nothing — this is a maintenance command"
  },
  "/sdrive:docs": {
    what: "Generates documentation and flags drift from the code.",
    why: "Keeps docs honest and up to date automatically.",
    when: "After implementation, or on a schedule. Use --all to document every ongoing feature.",
    does: [
      "Writes inline comments and API documentation",
      "Generates or refreshes the project README",
      "Flags places where the docs no longer match the code"
    ],
    produces: [
      ".sdrive/reports/docs/coverage-report-<feature>-<version>-<date>.md",
      "Updated README and inline docs"
    ],
    reads: ["The implementation", "The feature spec"],
    handsOff: "/sdrive:review"
  },
  "/sdrive:apply": {
    what: "Writes the production code from the approved tasks.",
    why: "This is where the plan becomes real, working software.",
    when: "After the plan is approved. Use --all to implement every ongoing feature, one branch each.",
    does: [
      "Works through the task list in order",
      "Commits to the feature branch as tasks complete",
      "Updates the governance task state as it goes"
    ],
    produces: [
      "Production source code",
      "Updated .sdrive/governance/<feature>/<version>/tasks.json",
      "Git commits on the feature branch"
    ],
    reads: ["tasks.md", "plan.md", "spec.md"],
    handsOff: "/sdrive:test"
  },
  "/sdrive:performance": {
    what: "Benchmarks and optimises performance and search visibility (SEO).",
    why: "Ensures the feature is not just correct, but fast enough and discoverable.",
    when: "After implementation, before review. Use --all to optimise every ongoing feature.",
    does: [
      "Benchmarks against the feature's speed NFRs",
      "Audits metadata, semantic HTML, structured data, and crawlability",
      "Applies approved speed and SEO fixes",
      "Re-measures to prove the fix landed"
    ],
    produces: [
      ".sdrive/reports/performance/performance-report-<feature>-<version>-<date>.md"
    ],
    reads: ["The implementation", "The feature's NFRs"],
    handsOff: "/sdrive:review"
  },
  "/sdrive:debug": {
    what: "Reproduces, isolates, and fixes defects — layout, APIs, runtime, and glitches.",
    why: "Turns a vague \"something is broken\" into a reproduced defect, a root cause, and a verified fix.",
    when: "When something is visibly wrong. Use --all to sweep every ongoing feature for defects.",
    does: [
      "Reproduces the symptom and captures evidence",
      "Isolates the smallest failing case",
      "Identifies the root cause before touching code",
      "Applies a minimal fix and re-verifies"
    ],
    produces: [
      ".sdrive/reports/debug/debug-report-<feature>-<version>-<date>.md",
      ".sdrive/reports/debug/repro/ (reproduction steps)",
      ".sdrive/reports/debug/evidence/ (before/after captures)"
    ],
    reads: ["The implementation", "Runtime logs and console output"],
    handsOff: "/sdrive:review"
  },
  "/sdrive:review": {
    what: "Runs the final audit and produces a pass/fail verdict.",
    why: "The last quality gate before work is considered done. It does not merge or archive.",
    when: "When the feature is complete. Use --all to review every ongoing feature one after the other.",
    does: [
      "Audits the code against the spec and acceptance criteria",
      "Checks quality, security, and governance compliance",
      "Issues a pass/fail verdict with findings"
    ],
    produces: [
      ".sdrive/reports/reviews/review-report-<feature>-<version>-<date>.md"
    ],
    reads: ["The implementation", "The spec", "Every prior report"],
    handsOff: "/sdrive:archive"
  },
  "/sdrive:archive": {
    what: "Merges an approved feature to main and completes its lifecycle.",
    why: "Turns a passing review into shipped, archived work — specs move to completed/ and the branch is cleaned up.",
    when: "Only after /sdrive:review has passed. Use --all to archive every ongoing feature that passed review.",
    does: [
      "Merges the feature branch into main",
      "Moves the spec from ongoing/ to completed/",
      "Deletes the merged feature branch",
      "Marks the feature complete in the workflow state"
    ],
    produces: [
      ".sdrive/specs/completed/<feature>/<version>/",
      "A merge commit on main"
    ],
    reads: ["The passing review report"],
    handsOff: "Nothing — the feature lifecycle ends here",
    optional: true,
    optionalNote:
      "Optional — run after a passing review, when you are ready to ship and close out the feature."
  },
  "/sdrive:secure": {
    what: "Performs a security audit, threat modelling, and fixes.",
    why: "Catches vulnerabilities before they reach users.",
    when: "Before the review gate. Use --all to audit every ongoing feature.",
    does: [
      "Threat-models the feature's attack surface",
      "Scans for OWASP-class vulnerabilities",
      "Applies approved fixes and re-tests"
    ],
    produces: [
      ".sdrive/reports/security/security-report-<feature>-<version>-<date>.md"
    ],
    reads: ["The implementation", "The feature spec"],
    handsOff: "/sdrive:review"
  },
  "/sdrive:test": {
    what: "Writes tests for the acceptance criteria and reports coverage.",
    why: "Proves the feature actually does what was promised.",
    when: "After implementation. Use --all to test every ongoing feature.",
    does: [
      "Writes tests covering each acceptance criterion",
      "Runs the suite and records the results",
      "Reports coverage and any unmet criteria"
    ],
    produces: [
      ".sdrive/reports/tests/test-report-<feature>-<version>-<date>.md",
      "Test files in the project's test directory"
    ],
    reads: ["The acceptance criteria", "The implementation"],
    handsOff: "/sdrive:review",
    optional: true,
    optionalNote:
      "Optional — run when development is done (end of a sprint or once an MVP is complete), not on every change."
  },
  "/sdrive:onboard": {
    what: "Adopts an existing project into SpecDrive.",
    why: "Brings legacy code under governance without breaking it.",
    when: "Only for existing projects, at the very start.",
    does: [
      "Reads the existing repository structure and conventions",
      "Detects other spec frameworks (OpenSpec, Spec Kit, Software Factory)",
      "Brings existing specs across without touching the originals",
      "Writes the project context files"
    ],
    produces: [
      ".sdrive/context/ (product, stack, constraints)",
      ".sdrive/onboarding-report.md"
    ],
    reads: ["The existing repository", "Any existing spec documents"],
    handsOff: "/sdrive:constitution"
  }
};

// The two product lifecycles SpecDrive supports. Rendered as cards at the
// bottom of the commands page so users can see which path applies to them.
// Each card shows the setup steps for that path, followed by the shared
// iteration lifecycle (propose -> apply -> review -> archive).
//
// Migration is NOT a separate lifecycle. Arriving from another spec framework
// is just a Brownfield project with extra context, so it is surfaced as a
// sub-card inside the Brownfield card (see `migrationNote`) rather than as a
// peer card with its own command list.
const PRODUCT_WORKFLOWS = [
  {
    id: "greenfield",
    name: "Greenfield",
    tagline: "Brand-new project",
    icon: "✦",
    summary:
      "You are beginning with a clean slate — either an empty folder or a freshly scaffolded repo that has no plan in place yet. SpecDrive walks you from that starting point all the way to governed, specified, and tested code.",
    steps: ["/sdrive:constitution", "/sdrive:product-plan"],
    iteration: ["/sdrive:propose", "/sdrive:apply", "/sdrive:review", "/sdrive:archive"]
  },
  {
    id: "brownfield",
    name: "Brownfield",
    tagline: "Existing codebase",
    icon: "◈",
    summary:
      "Your codebase is already well underway — a plan exists and development has moved far past the early stages. SpecDrive takes stock of what is there, writes specs after the fact, and flags the gaps as deferred so nothing breaks.",
    steps: ["/sdrive:onboard", "/sdrive:constitution"],
    iteration: ["/sdrive:propose", "/sdrive:apply", "/sdrive:review", "/sdrive:archive"],
    migrationNote: {
      title: "Coming from another spec framework?",
      body:
        "If SpecDrive detects OpenSpec, Software Factory, Spec Kit, or another spec-driven framework in your repo, onboarding brings your existing specs across and leaves the originals untouched. Nothing extra to run — the same Brownfield lifecycle applies."
    }
  }
];

// Optional commands are not part of the core workflow. They are run on demand —
// for example when a feature is totally done and ready to ship. They are shown
// in their own card on the Commands page, separate from the workflow cards.
const OPTIONAL_COMMANDS = {
  title: "Optional Commands",
  tagline: "Run on demand",
  icon: "✦",
  summary:
    "These commands are not part of the core workflow. Run them when you need them — for example when a feature is totally done and ready to ship.",
  commands: [
    {
      command: "/sdrive:update-propose",
      what: "Revises an existing proposal after feedback, without starting over.",
      when: "When a proposal needs changes before it is approved."
    },
    {
      command: "/sdrive:sync",
      what: "Re-aligns spec, plan, tasks, and traceability after a change.",
      when: "After a migration, or whenever the spec and the code drift apart."
    },
    {
      command: "/sdrive:performance",
      what: "Benchmarks and optimizes the code for speed, efficiency, and search visibility.",
      when: "When performance or SEO matters — before a release or after a slowdown."
    },
    {
      command: "/sdrive:debug",
      what: "Reproduces, isolates, and fixes defects — layout, APIs, runtime, and glitches.",
      when: "When something is visibly wrong — a broken layout, a failing endpoint, a console error."
    },
    {
      command: "/sdrive:docs",
      what: "Generates inline comments, API docs, and project READMEs.",
      when: "When you want documentation that matches the code."
    },
    {
      command: "/sdrive:secure",
      what: "Runs a deep security audit and fixes vulnerabilities.",
      when: "Before shipping anything that touches auth, data, or payments."
    },
    {
      command: "/sdrive:test",
      what: "Writes and runs the test suite for the feature.",
      when: "When development is done and you want coverage before review."
    },
    {
      command: "/sdrive:archive",
      what: "Merges an approved feature to main and completes its lifecycle.",
      when: "When the feature is totally done and /sdrive:review has passed."
    }
  ]
};

function apiCommands() {
  const manifestPath = path.join(sdriveRoot, "commands", "manifest.json");
  const manifest = loadJson(manifestPath, { commands: [] });

  const slash = (manifest.commands || []).map((c) => {
    const detail = SLASH_DETAILS[c.command] || {};
    return {
      command: c.command,
      description: c.description || "",
      agent: c.agent || "",
      acceptsFeature: Boolean(c.acceptsFeature),
      acceptsAll: Boolean(c.acceptsAll),
      gates: c.gates || [],
      what: detail.what || "",
      why: detail.why || "",
      when: detail.when || "",
      does: detail.does || [],
      produces: detail.produces || [],
      reads: detail.reads || [],
      handsOff: detail.handsOff || "",
      optional: Boolean(detail.optional),
      optionalNote: detail.optionalNote || ""
    };
  });

  return { slash, cli: CLI_COMMANDS, workflows: PRODUCT_WORKFLOWS, optionalCommands: OPTIONAL_COMMANDS };
}

function handleRequest(req, res) {
  const url = req.url;

  // Skill logos are binary assets, so they are served before the JSON API block
  // (which sets a JSON content-type header for everything under /api/).
  if (url.startsWith("/api/skill-logo/")) {
    const folder = decodeURIComponent(url.slice("/api/skill-logo/".length).split("?")[0]);
    return serveSkillLogo(res, folder);
  }

  if (url.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });

    if (url === "/api/workflow-state") {
      return res.end(JSON.stringify(apiWorkflowState()));
    }

    if (url === "/api/audit-log") {
      return res.end(JSON.stringify(apiAuditLog()));
    }

    if (url === "/api/activity") {
      return res.end(JSON.stringify(apiActivity()));
    }

    if (url === "/api/skills") {
      return res.end(JSON.stringify(apiSkills()));
    }
    if (url === "/api/team") {
      return res.end(JSON.stringify(apiTeam()));
    }

    if (url.startsWith("/api/traceability/")) {
      const { feature, version } = parseFeatureVersion(url);
      return res.end(JSON.stringify(apiTraceability(feature, version)));
    }

    if (url.startsWith("/api/tasks/")) {
      const { feature, version } = parseFeatureVersion(url);
      return res.end(JSON.stringify(apiTasks(feature, version)));
    }

    if (url.startsWith("/api/verification/")) {
      const { feature, version } = parseFeatureVersion(url);
      return res.end(JSON.stringify(apiVerification(feature, version)));
    }

    if (url.startsWith("/api/tests/")) {
      const { feature, version } = parseFeatureVersion(url);
      return res.end(JSON.stringify(apiTestReport(feature, version)));
    }

    if (url.startsWith("/api/reports/")) {
      const { feature, version } = parseFeatureVersion(url);
      return res.end(JSON.stringify(apiReports(feature, version)));
    }

    if (url.startsWith("/api/spec-files/")) {
      const { feature, version } = parseFeatureVersion(url);
      return res.end(JSON.stringify(apiSpecFiles(feature, version)));
    }

    if (url === "/api/onboarding") {
      return res.end(JSON.stringify(apiOnboarding()));
    }

    if (url === "/api/product") {
      return res.end(JSON.stringify(apiProduct()));
    }

    if (url === "/api/git-info") {
      return res.end(JSON.stringify(apiGitInfo()));
    }

    if (url === "/api/branches") {
      return res.end(JSON.stringify(apiBranches()));
    }

    if (url === "/api/project-info") {
      return res.end(JSON.stringify(apiProjectInfo()));
    }

    if (url === "/api/product-type") {
      return res.end(JSON.stringify(apiProductType()));
    }

    if (url === "/api/commands") {
      return res.end(JSON.stringify(apiCommands()));
    }

    res.writeHead(404);
    return res.end(JSON.stringify({ error: "Not found" }));
  }

  if (url === "/" || url === "/index.html") {
    return serveStatic(res, path.join(__dirname, "index.html"), "text/html");
  }

  // Path-based page routes. Each dashboard view is its own URL (e.g.
  // /product-plan, /features, /team). They all serve the same single-page shell;
  // the client router in app.js decides which section to display.
  const PAGE_ROUTES = ["/overview", "/product-plan", "/features", "/team", "/activity", "/commands", "/skills"];
  if (PAGE_ROUTES.includes(url)) {
    return serveStatic(res, path.join(__dirname, "index.html"), "text/html");
  }

  // Dynamic feature detail route: /features/<name>. Serves the same shell;
  // the client router renders the detail page for the named feature.
  if (/^\/features\/[^/]+\/?$/.test(url)) {
    return serveStatic(res, path.join(__dirname, "index.html"), "text/html");
  }

  if (url === "/style.css") {
    return serveStatic(res, path.join(__dirname, "style.css"), "text/css");
  }

  if (url === "/app.js") {
    return serveStatic(res, path.join(__dirname, "app.js"), "application/javascript");
  }

  if (url === "/logo.png") {
    const logoCandidates = [
      path.join(__dirname, "logo.png"),
      path.join(sdriveRoot, "logo.png"),
      path.join(projectRoot, "logo.png"),
      path.join(__dirname, "..", "logo.png"),
      path.join(__dirname, "..", "..", "logo.png")
    ];
    const logoPath = logoCandidates.find((candidate) => fs.existsSync(candidate));
    if (logoPath) {
      return serveStatic(res, logoPath, "image/png");
    }
  }

  res.writeHead(404);
  res.end("Not found");
}

// Preferred port, overridable via SDRIVE_PORT. If it is taken (for example
// another project's dashboard is already running), we walk forward to the next
// free port so multiple projects can each serve their own dashboard.
const PREFERRED_PORT = Number(process.env.SDRIVE_PORT) || 4747;
const MAX_PORT_ATTEMPTS = 20;

// A fresh server is created for every attempt. Reusing one server across
// listen() calls leaves stale "listening" callbacks queued, which makes the
// success message print once per failed attempt.
function listenOnFreePort(port, attemptsLeft) {
  const server = http.createServer(handleRequest);

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.log(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
      listenOnFreePort(port + 1, attemptsLeft - 1);
      return;
    }

    console.error(`\n❌ Could not start the dashboard: ${error.message}\n`);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`\n🚀 SpecDrive Dashboard running at http://localhost:${port}\n`);
  });
}

listenOnFreePort(PREFERRED_PORT, MAX_PORT_ATTEMPTS);