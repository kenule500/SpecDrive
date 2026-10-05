const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

function getWorkflowState() {
  const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

  if (!fs.existsSync(workflowStatePath)) {
    console.error("❌ workflow-state.json not found. Run `sdrive init` first.");
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));
}

function saveWorkflowState(state) {
  const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");
  fs.writeFileSync(workflowStatePath, JSON.stringify(state, null, 2));
}

// Gates live on the feature's CURRENT VERSION (`versions[].gates`), never on the
// feature itself. Older builds read `feature.gates`, which does not exist, so
// every gate looked unapproved and `sdrive approve` silently did nothing.
function resolveVersion(feature) {
  if (!feature || !Array.isArray(feature.versions) || feature.versions.length === 0) {
    return null;
  }

  return (
    feature.versions.find((v) => v.id === feature.currentVersion) || feature.versions[0]
  );
}

function findFeature(state, featureName) {
  return (state.features || []).find((f) => f.name === featureName) || null;
}

function getFeature(featureName) {
  return findFeature(getWorkflowState(), featureName);
}

function gateStatus(featureName, gate) {
  const feature = getFeature(featureName);

  if (!feature) {
    return "unknown";
  }

  const version = resolveVersion(feature);

  if (!version) {
    return "unknown";
  }

  return (version.gates && version.gates[gate]) || "pending";
}

function approveGate(featureName, gate) {
  // Read ONCE and mutate that same object. The old implementation called
  // getFeature() — which re-reads the file — so the mutation was applied to a
  // throwaway object and discarded when `state` was saved.
  const state = getWorkflowState();
  const feature = findFeature(state, featureName);

  if (!feature) {
    console.error(`❌ Feature "${featureName}" not found.`);
    return false;
  }

  const version = resolveVersion(feature);

  if (!version) {
    console.error(`❌ Feature "${featureName}" has no versions.`);
    return false;
  }

  version.gates = version.gates || {};
  version.gates[gate] = "approved";

  version.history = version.history || [];
  version.history.push({
    event: `${gate}_approved`,
    timestamp: new Date().toISOString()
  });

  saveWorkflowState(state);
  console.log(`✅ Gate "${gate}" approved for feature "${featureName}".`);
  return true;
}

function isGateApproved(featureName, gate) {
  return gateStatus(featureName, gate) === "approved";
}

// ---------- GATE REQUIREMENT VERIFICATION ----------
//
// Approving a gate is an assertion that the work it certifies is actually done.
// Without these checks `sdrive approve` would happily mark an empty or unfinished
// feature as approved and write a history/audit entry saying so — a governance
// record that contradicts the repository. Verification happens BEFORE any write,
// so a failed check leaves the state file untouched.

// Each gate certifies everything before it, so order matters.
const GATE_ORDER = ["specification", "planning", "implementation", "review"];

// Specs are lifecycle-partitioned; governance is deliberately not.
const SPEC_STAGES = ["backlog", "ongoing", "completed"];

// Locate where a feature version actually lives under specs/.
function findSpecLocation(root, featureName, versionId) {
  for (const stage of SPEC_STAGES) {
    const dir = path.join(root, ".sdrive", "specs", stage, featureName, versionId);

    if (fs.existsSync(dir)) {
      return { stage, dir };
    }
  }

  return null;
}

function readJsonIfPresent(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return null;
  }
}

function countTasks(tasksJson) {
  let total = 0;
  let done = 0;

  for (const phase of (tasksJson && tasksJson.phases) || []) {
    for (const task of phase.tasks || []) {
      total += 1;

      if (task.completed === true) {
        done += 1;
      }
    }
  }

  return { total, done };
}

// Returns { ok, blockers, warnings, location, current, tasks }.
// `ok === false` means the gate must NOT be approved and nothing may be written.
function checkGateRequirements(root, feature, version, gate) {
  const blockers = [];
  const warnings = [];
  const gates = version.gates || {};
  const location = findSpecLocation(root, feature.name, version.id);
  const gov = path.join(root, ".sdrive", "governance", feature.name, version.id);
  const govFile = (name) => path.join(gov, name);

  if (!location) {
    blockers.push(
      `No spec folder for "${feature.name}" ${version.id} under .sdrive/specs/{${SPEC_STAGES.join(", ")}}/`
    );
  }

  if (location && location.stage === "completed") {
    blockers.push(
      `"${feature.name}" is archived in specs/completed/. Gates on a completed feature are history - run \`sdrive reopen ${feature.name}\` first.`
    );
  }

  if (version.phase === "completed") {
    blockers.push(`Version "${version.id}" is already completed.`);
  }

  // Prerequisite gates must already be approved.
  const gateIndex = GATE_ORDER.indexOf(gate);

  for (let i = 0; i < gateIndex; i += 1) {
    const earlier = GATE_ORDER[i];

    if (gates[earlier] !== "approved") {
      blockers.push(
        `Prerequisite gate "${earlier}" is "${gates[earlier] || "pending"}", not "approved".`
      );
    }
  }

  const requireSpecFile = (name, why) => {
    if (location && !fs.existsSync(path.join(location.dir, name))) {
      blockers.push(`Missing ${name} in the version folder (${why}).`);
    }
  };

  const requireGovFile = (name, why) => {
    if (!fs.existsSync(govFile(name))) {
      blockers.push(`Missing ${name} in .sdrive/governance/${feature.name}/${version.id}/ (${why}).`);
    }
  };

  let tasks = null;

  if (gate === "specification") {
    requireSpecFile("spec.md", "the specification being approved");
    requireGovFile("spec.json", "machine-readable specification");
  }

  if (gate === "planning") {
    requireSpecFile("plan.md", "the technical plan");
    requireSpecFile("tasks.md", "the task list");
    requireGovFile("plan.json", "machine-readable plan");
    requireGovFile("tasks.json", "machine-readable tasks");
    requireGovFile("traceability.json", "requirement-to-task traceability");
  }

  if (gate === "implementation") {
    const tasksPath = govFile("tasks.json");

    if (!fs.existsSync(tasksPath)) {
      blockers.push("Missing tasks.json, so finished work cannot be confirmed.");
    } else {
      tasks = countTasks(readJsonIfPresent(tasksPath));

      if (tasks.total === 0) {
        blockers.push("tasks.json contains no tasks, so there is no work to certify.");
      } else if (tasks.done < tasks.total) {
        blockers.push(
          `${tasks.total - tasks.done} of ${tasks.total} tasks are still incomplete in tasks.json.`
        );
      }
    }

    const verificationPath = govFile("verification.json");

    if (fs.existsSync(verificationPath)) {
      const status = (readJsonIfPresent(verificationPath) || {}).status;

      if (status === "fail") {
        blockers.push(
          `verification.json reports status "fail" - run \`sdrive verify ${feature.name}\` after fixing it.`
        );
      } else if (status && status !== "pass" && status !== "warn") {
        warnings.push(`verification.json has an unrecognised status "${status}".`);
      }
    } else {
      warnings.push(`No verification.json yet - run \`sdrive verify ${feature.name}\` for a spec-to-code check.`);
    }
  }

  if (gate === "review") {
    const reviewPath = location ? path.join(location.dir, "review.md") : null;

    if (!reviewPath || !fs.existsSync(reviewPath)) {
      blockers.push("Missing review.md in the version folder, so there is no verdict to approve.");
    } else if (!/Status:\s*PASS/i.test(fs.readFileSync(reviewPath, "utf8"))) {
      blockers.push(
        `review.md does not record \`Status: PASS\` - a failing or torn verdict cannot be approved.`
      );
    }
  }

  // Overwriting a decision is a deliberate act and is called out, never silent.
  const current = gates[gate];

  if (current === "rejected") {
    warnings.push(
      `Gate "${gate}" is currently "rejected". Approving overwrites that rejection.`
    );
  } else if (current === "in_progress") {
    warnings.push(`Gate "${gate}" is currently "in_progress".`);
  } else if (current === "approved") {
    warnings.push(`Gate "${gate}" is already approved.`);
  }

  return { ok: blockers.length === 0, blockers, warnings, location, current, tasks };
}

module.exports = {
  getWorkflowState,
  saveWorkflowState,
  resolveVersion,
  findFeature,
  getFeature,
  gateStatus,
  approveGate,
  isGateApproved,
  GATE_ORDER,
  SPEC_STAGES,
  findSpecLocation,
  checkGateRequirements
};