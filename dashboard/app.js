async function fetchJson(url) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (error) {
    return null;
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gateClass(status) {
  if (status === "approved") return "gate approved";
  if (status === "in_progress") return "gate in_progress";
  return "gate pending";
}

function phaseTone(phase) {
  if (phase === "completed") return "green";
  if (phase === "ongoing") return "blue";
  if (phase === "blocked") return "red";
  return "amber";
}

function verificationTone(status) {
  if (status === "pass") return "green";
  if (status === "warn") return "amber";
  if (status === "fail") return "red";
  return "slate";
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/[\s-_]+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(iso) {
  if (!iso) return "â€”";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatDateTime(iso) {
  if (!iso) return "â€”";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getFilterValues() {
  return {
    search: document.getElementById("filter-search").value.trim().toLowerCase(),
    phase: document.getElementById("filter-phase").value,
    verification: document.getElementById("filter-verification").value,
    tests: document.getElementById("filter-tests").value,
    currentVersionOnly: document.getElementById("filter-current-version").checked
  };
}

function featureMatchesFilters(feature, version, filters, verification, tests) {
  if (filters.search && !feature.name.toLowerCase().includes(filters.search)) {
    return false;
  }

  if (filters.phase && version.phase !== filters.phase) {
    return false;
  }

  if (filters.verification) {
    const status =
      verification.status === "not_run" || !verification.status
        ? "not_run"
        : verification.status;

    if (status !== filters.verification) {
      return false;
    }
  }

  if (filters.tests) {
    const testStatus =
      tests.status === "not_run" || !tests.status ? "not_run" : tests.status;

    if (testStatus !== filters.tests) {
      return false;
    }
  }

  return true;
}

/* ============================================================
   GIT INFO
   ============================================================ */
function renderGitInfo(git) {
  const sidebar = document.getElementById("sidebar-git");
  const chip = document.getElementById("topbar-git");

  if (!git || !git.available) {
    if (sidebar) sidebar.textContent = "Not a git repository";
    if (chip) chip.textContent = "No git";
    return;
  }

  if (sidebar) {
    sidebar.innerHTML = `
      <div><span class="git-branch-name">${escapeHtml(git.branch)}</span></div>
      <div class="git-meta">${escapeHtml(git.commit)} Â· ${escapeHtml(git.author || "")}</div>
      ${git.mergedFrom ? `<div class="git-meta">merged from ${escapeHtml(git.mergedFrom)}</div>` : ""}
    `;
  }

  if (chip) {
    const sync =
      git.ahead || git.behind
        ? ` Â· â†‘${git.ahead} â†“${git.behind}`
        : "";
    chip.innerHTML = `
      <span class="dot ${git.dirty ? "dirty" : ""}"></span>
      <span class="branch">${escapeHtml(git.branch)}</span>
      <span>${escapeHtml(git.commit)}${sync}</span>
    `;
    chip.title = `${git.subject || ""}${git.mergedFrom ? `\nMerged from: ${git.mergedFrom}` : ""}`;
  }
}

/* ============================================================
   OVERVIEW
   ============================================================ */
function renderOverview(onboarding, git) {
  const wrap = document.createElement("div");
  wrap.className = "overview-grid";

  if (!onboarding) {
    wrap.innerHTML = `
      <div class="stat-card tone-green">
        <span class="stat-icon">â—ˆ</span>
        <span class="stat-label">Project Type</span>
        <span class="stat-value small">Greenfield</span>
        <span class="stat-sub">Fully SpecDrive-native â€” no onboarding needed</span>
      </div>
      <div class="stat-card tone-blue">
        <span class="stat-icon">âŽ‡</span>
        <span class="stat-label">Current Branch</span>
        <span class="stat-value small">${escapeHtml(git?.branch || "â€”")}</span>
        <span class="stat-sub">${escapeHtml(git?.commit || "")} ${git?.dirty ? "Â· uncommitted changes" : ""}</span>
      </div>
    `;
    return wrap;
  }

  const missing = onboarding.missing || [];
  const deferred = onboarding.deferred || [];
  const migrated = onboarding.migrated || [];
  const skipped = onboarding.skipped || [];
  const retro = onboarding.retroactiveFeatures || [];
  const verified = onboarding.verifiedFeatures || [];

  const isPartial = missing.length > 0;

  wrap.innerHTML = `
    <div class="stat-card ${isPartial ? "tone-amber" : "tone-green"}">
      <span class="stat-icon">â—ˆ</span>
      <span class="stat-label">Project Type</span>
      <span class="stat-value small">${isPartial ? "Brownfield Â· Partial" : "Brownfield Â· Onboarded"}</span>
      <span class="stat-sub">Onboarded ${escapeHtml(formatDate(onboarding.date))}</span>
    </div>

    <div class="stat-card tone-blue">
      <span class="stat-icon">âŽ‡</span>
      <span class="stat-label">Current Branch</span>
      <span class="stat-value small">${escapeHtml(git?.branch || "â€”")}</span>
      <span class="stat-sub">${escapeHtml(git?.commit || "")}${git?.dirty ? " Â· uncommitted changes" : ""}</span>
    </div>

    <div class="stat-card tone-blue">
      <span class="stat-icon">â‡„</span>
      <span class="stat-label">Merged From</span>
      <span class="stat-value small">${escapeHtml(git?.mergedFrom || "â€”")}</span>
      <span class="stat-sub">${git?.mergedFrom ? "upstream / default branch" : "no merge source detected"}</span>
    </div>

    <div class="stat-card tone-green">
      <span class="stat-icon">âœ“</span>
      <span class="stat-label">Verified Features</span>
      <span class="stat-value">${verified.length}</span>
      <span class="stat-sub">${retro.length} retroactive total</span>
    </div>

    <div class="stat-card ${missing.length ? "tone-red" : "tone-green"}">
      <span class="stat-icon">!</span>
      <span class="stat-label">Missing</span>
      <span class="stat-value">${missing.length}</span>
      <span class="stat-sub">${missing.length ? escapeHtml(missing[0]) : "nothing outstanding"}</span>
    </div>

    <div class="stat-card ${deferred.length ? "tone-amber" : "tone-green"}">
      <span class="stat-icon">â¸</span>
      <span class="stat-label">Deferred</span>
      <span class="stat-value">${deferred.length}</span>
      <span class="stat-sub">${deferred.length ? escapeHtml(deferred[0]) : "nothing deferred"}</span>
    </div>

    <div class="overview-detail">
      <h3>â—ˆ Onboarding Details</h3>
      <div class="detail-grid">
        <div>
          <div class="detail-block-label">Missing</div>
          ${
            missing.length
              ? `<ul class="detail-list">${missing.map((m) => `<li><span>âœ•</span><span>${escapeHtml(m)}</span></li>`).join("")}</ul>`
              : `<div class="stat-sub">None</div>`
          }
        </div>
        <div>
          <div class="detail-block-label">Deferred</div>
          ${
            deferred.length
              ? `<ul class="detail-list">${deferred.map((m) => `<li><span>â¸</span><span>${escapeHtml(m)}</span></li>`).join("")}</ul>`
              : `<div class="stat-sub">None</div>`
          }
        </div>
        <div>
          <div class="detail-block-label">Migrated Features</div>
          ${
            migrated.length
              ? `<ul class="detail-list">${migrated
                  .map((m) => {
                    const src =
                      m.from === "openspec" ? "OpenSpec" : m.from === "speckit" ? "Spec-Kit" : m.from;
                    return `<li><span>ðŸ“¦</span><span><span class="li-key">${escapeHtml(m.feature)}</span> <span class="li-meta">from ${escapeHtml(src)}</span></span></li>`;
                  })
                  .join("")}</ul>`
              : `<div class="stat-sub">None</div>`
          }
        </div>
        <div>
          <div class="detail-block-label">Skipped Migrations</div>
          ${
            skipped.length
              ? `<ul class="detail-list">${skipped
                  .map((s) => {
                    const sys =
                      s.system === "openspec" ? "OpenSpec" : s.system === "speckit" ? "Spec-Kit" : s.system;
                    return `<li><span>â­</span><span><span class="li-key">${escapeHtml(sys)}</span>${s.reason ? ` <span class="li-meta">${escapeHtml(s.reason)}</span>` : ""}</span></li>`;
                  })
                  .join("")}</ul>`
              : `<div class="stat-sub">None</div>`
          }
        </div>
      </div>
      ${onboarding.notes ? `<div class="overview-note">${escapeHtml(onboarding.notes)}</div>` : ""}
    </div>
  `;

  return wrap;
}

/* ============================================================
   PRODUCT BLUEPRINT
   ============================================================ */
function renderProduct(product) {
  const div = document.createElement("div");

  if (!product || !product.exists) {
    div.className = "panel-loading";
    div.innerHTML = `No product blueprint yet. Run <code>/sdrive:blueprint</code> to create a product overview, conceptual mockup, roadmap, and feature backlog.`;
    return div;
  }

  const backlog = product.backlog || [];
  const pending = backlog.filter((item) => /pending/i.test(item.status)).length;
  const deferred = backlog.filter((item) => /deferred/i.test(item.status)).length;

  const backlogRows = backlog.length
    ? backlog
        .map((item) => {
          const tone = /pending/i.test(item.status)
            ? "amber"
            : /deferred/i.test(item.status)
            ? "slate"
            : "green";
          return `
        <tr>
          <td class="backlog-id">${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.feature)}</td>
          <td><span class="chip ${tone}">${escapeHtml(item.status)}</span></td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="product-empty">No backlog items yet.</td></tr>`;

  div.innerHTML = `
    <div class="blueprint-wrap">
      <div class="stat-card tone-accent">
        <span class="stat-icon">â–¤</span>
        <span class="stat-label">Backlog Items</span>
        <span class="stat-value">${backlog.length}</span>
        <span class="stat-sub">product-level candidates</span>
      </div>
      <div class="stat-card tone-amber">
        <span class="stat-icon">â³</span>
        <span class="stat-label">Pending</span>
        <span class="stat-value">${pending}</span>
        <span class="stat-sub">awaiting promotion</span>
      </div>
      <div class="stat-card tone-slate">
        <span class="stat-icon">ðŸ’¤</span>
        <span class="stat-label">Deferred</span>
        <span class="stat-value">${deferred}</span>
        <span class="stat-sub">parked for later</span>
      </div>
    </div>

    <div class="blueprint-panel">
      <div class="detail-block-label">Artifacts</div>
      <div class="blueprint-artifacts">
        ${product.overview ? `<span class="artifact-chip">ðŸ“„ overview.md</span>` : ""}
        ${product.mockup ? `<span class="artifact-chip">ðŸ—ºï¸ mockup.md</span>` : ""}
        ${product.designSystem ? `<span class="artifact-chip">ðŸŽ¨ design-system.md</span>` : ""}
        ${product.roadmap ? `<span class="artifact-chip">ðŸ›£ï¸ roadmap.md</span>` : ""}
      </div>

      <table class="backlog-table">
        <thead>
          <tr><th>ID</th><th>Feature</th><th>Status</th></tr>
        </thead>
        <tbody>${backlogRows}</tbody>
      </table>

      <div class="product-note">
        Backlog items are product-level candidates. Promote one with <code>/sdrive:propose</code> to start detailed planning.
      </div>
    </div>
  `;

  return div;
}

/* ============================================================
   FEATURES
   ============================================================ */
function renderVersionBlock(feature, version, isCurrent, traceability, verification, tests) {
  const rows = traceability.rows || [];
  const completed = rows.filter((r) => r.status === "complete").length;
  const coverage = rows.length === 0 ? 0 : Math.round((completed / rows.length) * 100);

  const vStatus = verification.status || "not_run";
  const vTone = verificationTone(vStatus);
  const vLabel =
    vStatus === "pass"
      ? `PASS Â· ${verification.summary?.matched ?? 0} matched`
      : vStatus === "warn"
      ? `WARN Â· ${verification.summary?.extra ?? 0} extra`
      : vStatus === "fail"
      ? `FAIL Â· ${verification.summary?.missing ?? 0} missing`
      : "NOT RUN";

  const tStatus = tests.status || "not_run";
  const tTone = tStatus === "complete" ? "green" : tStatus === "partial" ? "amber" : "slate";
  const tLabel =
    tStatus === "not_run"
      ? "NOT RUN"
      : `${tests.summary?.coverage ?? 0}% Â· ${tests.summary?.testedACs ?? 0}/${tests.summary?.totalACs ?? 0} ACs`;

  const history = (version.history || []).filter((h) => h.event.endsWith("_approved"));

  const block = document.createElement("div");
  block.className = "version-block" + (isCurrent ? " current" : "");

  block.innerHTML = `
    <div class="version-head">
      <span class="version-id">
        <span class="chip ${isCurrent ? "accent" : "slate"}">${isCurrent ? "current" : "past"}</span>
        ${escapeHtml(version.id)}
      </span>
      <span class="version-phase">${escapeHtml(version.phase)} Â· ${escapeHtml(version.currentStep)}</span>
    </div>

    <div class="gate-row">
      <span class="${gateClass(version.gates?.specification)}">spec</span>
      <span class="${gateClass(version.gates?.planning)}">plan</span>
      <span class="${gateClass(version.gates?.implementation)}">impl</span>
      <span class="${gateClass(version.gates?.review)}">review</span>
    </div>

    <div class="metric-row">
      <div class="metric">
        <span class="metric-label">Traceability</span>
        <span class="metric-bar ${coverage === 100 ? "green" : coverage > 0 ? "amber" : "red"}">
          <span style="width: ${coverage}%"></span>
        </span>
        <span class="metric-value">${coverage}% (${completed}/${rows.length})</span>
      </div>
      <div class="metric">
        <span class="metric-label">Verification</span>
        <span class="chip ${vTone}">${escapeHtml(vLabel)}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Tests</span>
        <span class="chip ${tTone}">${escapeHtml(tLabel)}</span>
      </div>
    </div>

    ${
      history.length
        ? `<div class="history-list">${history
            .map(
              (h) =>
                `<div class="history-item"><span class="tick">âœ“</span>${escapeHtml(
                  h.event.replace("_approved", "")
                )} approved by ${escapeHtml(h.by || "unknown")}</div>`
            )
            .join("")}</div>`
        : ""
    }
  `;

  return block;
}

function featureMembers(feature, team) {
  const byRole = {};
  (team.members || []).forEach((m) => {
    byRole[m.username] = m.role;
  });

  const seen = new Map();
  const add = (h) => {
    if (h && h.by && !seen.has(h.by)) {
      seen.set(h.by, byRole[h.by] || "member");
    }
  };

  // History may live at the feature level or inside each version.
  (feature.history || []).forEach(add);
  (feature.versions || []).forEach((version) => {
    (version.history || []).forEach(add);
  });

  return Array.from(seen, ([username, role]) => ({ username, role }));
}

function roleFor(username, team) {
  const member = (team.members || []).find((m) => m.username === username);
  return member ? member.role : "member";
}

function featureAssigneeEl(feature, team) {
  if (!feature.assignee) return null;

  const role = roleFor(feature.assignee, team);
  const wrap = document.createElement("div");
  wrap.className = "feature-assignee";
  wrap.innerHTML = `
    <span class="feature-assignee-avatar role-${escapeHtml(role)}">${escapeHtml(
      initials(feature.assignee)
    )}</span>
    <span class="feature-assignee-info">
      <span class="feature-assignee-label">Assigned to</span>
      <span class="feature-assignee-name">${escapeHtml(feature.assignee)}</span>
    </span>
  `;
  return wrap;
}

function featureMembersEl(members) {
  const wrap = document.createElement("div");
  wrap.className = "feature-members";
  wrap.innerHTML = `
    <span class="feature-members-label">Approved by</span>
    <div class="feature-members-avatars">
      ${members
        .map(
          (m) =>
            `<span class="feature-member-avatar role-${escapeHtml(m.role)}" title="${escapeHtml(
              m.username
            )} Â· ${escapeHtml(m.role)}">${escapeHtml(initials(m.username))}</span>`
        )
        .join("")}
    </div>
  `;
  return wrap;
}

async function renderFeatures() {
  const state = await fetchJson("/api/workflow-state");
  const team = (await fetchJson("/api/team")) || { members: [] };
  const container = document.getElementById("feature-list");

  if (!state || !state.features || state.features.length === 0) {
    container.className = "panel-loading";
    container.textContent = "No features yet.";
    return;
  }

  const filters = getFilterValues();
  container.className = "feature-grid";
  container.innerHTML = "";

  let rendered = 0;

  for (const f of state.features) {
    const card = document.createElement("div");
    card.className = "feature-card";

    const members = featureMembers(f, team);

    const head = document.createElement("div");
    head.className = "feature-card-head";
    head.innerHTML = `
      <div class="feature-card-title">
        <span class="feature-name">${escapeHtml(f.name)}</span>
        <span class="chip accent">${escapeHtml(f.currentVersion)}</span>
      </div>
      ${f.branch ? `<span class="feature-branch">âŽ‡ ${escapeHtml(f.branch)}</span>` : ""}
    `;
    const assigneeEl = featureAssigneeEl(f, team);
    if (assigneeEl) {
      head.appendChild(assigneeEl);
    }
    if (members.length) {
      head.appendChild(featureMembersEl(members));
    }
    card.appendChild(head);

    const body = document.createElement("div");
    body.className = "feature-card-body";

    const versions = f.versions || [];
    let versionRendered = 0;

    for (const version of versions) {
      const isCurrent = version.id === f.currentVersion;

      if (filters.currentVersionOnly && !isCurrent) {
        continue;
      }

      const traceability = (await fetchJson(`/api/traceability/${f.name}/${version.id}`)) || { rows: [] };
      const verification = (await fetchJson(`/api/verification/${f.name}/${version.id}`)) || { status: "not_run", summary: {} };
      const tests = (await fetchJson(`/api/tests/${f.name}/${version.id}`)) || { status: "not_run", summary: {} };

      if (!featureMatchesFilters(f, version, filters, verification, tests)) {
        continue;
      }

      body.appendChild(renderVersionBlock(f, version, isCurrent, traceability, verification, tests));
      versionRendered++;
    }

    if (versionRendered > 0) {
      card.appendChild(body);
      container.appendChild(card);
      rendered++;
    }
  }

  if (rendered === 0) {
    container.className = "panel-loading";
    container.textContent = "No features match the current filters.";
  }
}

/* ============================================================
   TEAM
   ============================================================ */
async function renderTeam() {
  const team = await fetchJson("/api/team");
  const container = document.getElementById("team-list");

  if (!team || !team.members || team.members.length === 0) {
    container.className = "panel-loading";
    container.textContent = "No team members.";
    return;
  }

  container.className = "team-grid";
  container.innerHTML = "";

  team.members.forEach((m) => {
    const card = document.createElement("div");
    card.className = "member-card";
    card.innerHTML = `
      <div class="member-avatar role-${escapeHtml(m.role)}">${escapeHtml(initials(m.username))}</div>
      <div class="member-info">
        <div class="member-name">${escapeHtml(m.username)}</div>
        <div class="member-role">${escapeHtml(m.role)}</div>
      </div>
    `;
    container.appendChild(card);
  });

  const rules = team.rules || {};
  if (rules.approval_required || rules.implementation_allowed) {
    const rulesCard = document.createElement("div");
    rulesCard.className = "team-rules";
    rulesCard.innerHTML = `
      ${
        rules.approval_required
          ? `<div>
              <div class="rule-block-label">Approval Required</div>
              <div class="chip-list">${rules.approval_required
                .map((r) => `<span class="chip green">${escapeHtml(r)}</span>`)
                .join("")}</div>
            </div>`
          : ""
      }
      ${
        rules.implementation_allowed
          ? `<div>
              <div class="rule-block-label">Implementation Allowed</div>
              <div class="chip-list">${rules.implementation_allowed
                .map((r) => `<span class="chip blue">${escapeHtml(r)}</span>`)
                .join("")}</div>
            </div>`
          : ""
      }
    `;
    container.appendChild(rulesCard);
  }
}

/* ============================================================
   ACTIVITY
   ============================================================ */
function auditTone(event) {
  if (/approved|merged|completed/i.test(event)) return "green";
  if (/created|version/i.test(event)) return "blue";
  if (/rejected|failed|blocked/i.test(event)) return "amber";
  return "";
}

async function renderAudit() {
  const log = await fetchJson("/api/audit-log");
  const container = document.getElementById("audit-list");

  if (!log || !log.events || log.events.length === 0) {
    container.className = "panel-loading";
    container.textContent = "No activity yet.";
    return;
  }

  container.className = "timeline";
  container.innerHTML = "";

  log.events
    .slice(-20)
    .reverse()
    .forEach((e) => {
      const item = document.createElement("div");
      item.className = "timeline-item";

      const details = e.details || {};
      const detailParts = Object.entries(details)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" Â· ");

      item.innerHTML = `
        <span class="timeline-dot ${auditTone(e.event)}"></span>
        <div class="timeline-body">
          <div class="timeline-event">${escapeHtml(String(e.event).replace(/_/g, " "))}</div>
          <div class="timeline-meta">${escapeHtml(formatDateTime(e.timestamp))}</div>
          ${detailParts ? `<div class="timeline-details">${escapeHtml(detailParts)}</div>` : ""}
        </div>
      `;
      container.appendChild(item);
    });
}

/* ============================================================
   COMMAND REFERENCE
   ============================================================ */
let commandData = { slash: [], cli: [] };
let activeCommandTab = "slash";
let commandQuery = "";

function commandMatches(item) {
  if (!commandQuery) return true;
  const haystack = `${item.command} ${item.description} ${item.group || ""}`.toLowerCase();
  return haystack.includes(commandQuery);
}

function renderCommandList() {
  const container = document.getElementById("command-list");
  if (!container) return;

  const source = activeCommandTab === "slash" ? commandData.slash : commandData.cli;
  const items = source.filter(commandMatches);

  if (items.length === 0) {
    container.className = "command-list";
    container.innerHTML = `<div class="command-empty">No commands match “${escapeHtml(commandQuery)}”.</div>`;
    return;
  }

  container.className = "command-list";
  container.innerHTML = "";

  // Group CLI commands by their group; slash commands render as one table.
  if (activeCommandTab === "cli") {
    const groups = {};
    items.forEach((item) => {
      const g = item.group || "Other";
      (groups[g] = groups[g] || []).push(item);
    });

    Object.keys(groups).forEach((groupName) => {
      const label = document.createElement("div");
      label.className = "command-group-label";
      label.textContent = groupName;
      container.appendChild(label);
      container.appendChild(commandTableEl(groups[groupName]));
    });
  } else {
    container.appendChild(commandTableEl(items));
  }
}

function commandTableEl(items) {
  const table = document.createElement("table");
  table.className = "command-table";

  const head = document.createElement("thead");
  head.innerHTML = `
    <tr>
      <th class="col-command">Command</th>
      <th>Description</th>
      <th class="col-meta">Details</th>
    </tr>
  `;
  table.appendChild(head);

  const body = document.createElement("tbody");
  items.forEach((item) => body.appendChild(commandRowEl(item)));
  table.appendChild(body);

  return table;
}

function commandRowEl(item) {
  const tr = document.createElement("tr");

  const meta = [];
  if (item.acceptsFeature) meta.push(`<span class="chip blue">feature</span>`);
  if (item.agent) meta.push(`<span class="chip slate">${escapeHtml(item.agent)}</span>`);
  (item.gates || []).forEach((g) => meta.push(`<span class="chip amber">gate: ${escapeHtml(g)}</span>`));

  tr.innerHTML = `
    <td class="col-command"><code class="command-code" title="Click to copy">${escapeHtml(item.command)}</code></td>
    <td><div class="command-desc">${escapeHtml(item.description)}</div></td>
    <td class="col-meta">${meta.length ? `<div class="command-meta">${meta.join("")}</div>` : ""}</td>
  `;

  const code = tr.querySelector(".command-code");
  code.addEventListener("click", () => {
    const text = item.command;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        const original = code.textContent;
        code.textContent = "copied!";
        setTimeout(() => (code.textContent = original), 900);
      });
    }
  });

  return tr;
}

async function renderCommands() {
  const data = await fetchJson("/api/commands");
  commandData = data || { slash: [], cli: [] };

  const search = document.getElementById("command-search");
  if (search) {
    search.addEventListener("input", () => {
      commandQuery = search.value.trim().toLowerCase();
      renderCommandList();
    });
  }

  document.querySelectorAll(".command-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".command-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeCommandTab = tab.dataset.tab;
      renderCommandList();
    });
  });

  renderCommandList();
}

/* ============================================================
   NAV HIGHLIGHT
   ============================================================ */
function setupNav() {
  const items = document.querySelectorAll(".nav-item");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      items.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
    });
  });

  const sections = document.querySelectorAll(".section");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            items.forEach((i) => {
              i.classList.toggle("active", i.dataset.nav === id);
            });
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach((s) => observer.observe(s));
  }
}

/* ============================================================
   MAIN
   ============================================================ */
async function main() {
  const [onboarding, product, git] = await Promise.all([
    fetchJson("/api/onboarding"),
    fetchJson("/api/product"),
    fetchJson("/api/git-info")
  ]);

  renderGitInfo(git);

  const overviewContainer = document.getElementById("overview-panel");
  if (overviewContainer) {
    overviewContainer.innerHTML = "";
    overviewContainer.appendChild(renderOverview(onboarding, git));
  }

  const productContainer = document.getElementById("product-panel");
  if (productContainer) {
    productContainer.innerHTML = "";
    productContainer.appendChild(renderProduct(product));
  }

  [
    "filter-search",
    "filter-phase",
    "filter-verification",
    "filter-tests",
    "filter-current-version"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", renderFeatures);
      el.addEventListener("change", renderFeatures);
    }
  });

  setupNav();

  await renderFeatures();
  await renderTeam();
  await renderAudit();
  await renderCommands();
}

main();
