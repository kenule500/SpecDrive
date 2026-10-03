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

// Human-readable gate metadata. Gates are approval checkpoints a feature must
// clear before it can advance; without a label users mistake them for metrics.
const GATE_DEFS = [
  { key: "specification", label: "Spec", hint: "Specification approved" },
  { key: "planning", label: "Plan", hint: "Plan approved" },
  { key: "implementation", label: "Impl", hint: "Implementation approved" },
  { key: "review", label: "Review", hint: "Review approved" }
];

function gateStatusMeta(status) {
  if (status === "approved") return { icon: "âœ“", text: "approved" };
  if (status === "in_progress") return { icon: "â—", text: "in progress" };
  return { icon: "â—‹", text: "pending" };
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
   PROJECT INFO
   ============================================================ */
function renderProjectInfo(project) {
  const name = (project && project.name) || "project";

  const sidebar = document.getElementById("sidebar-project");
  if (sidebar) sidebar.textContent = name;

  const topbar = document.getElementById("topbar-project");
  if (topbar) topbar.textContent = name;

  if (project && project.name) {
    document.title = `${project.name} · SpecDrive Dashboard`;
  }
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
function renderOverview(onboarding, git, product, productType) {
  const wrap = document.createElement("div");
  wrap.className = "overview-page";

  const summary = product?.summary || null;

  wrap.innerHTML = `
    ${renderOverviewHero(summary, git, productType)}
    ${renderOverviewKpis(onboarding, git, summary)}
    ${renderOverviewPanels(onboarding, git, summary)}
  `;

  return wrap;
}

/* Hero banner — the product's identity at a glance. */
function renderOverviewHero(summary, git, productType) {
  const title = summary?.title || "Project Overview";
  const vision = summary?.vision || "";
  const status = summary?.status || "";
  const branch = git?.branch || "—";

  const pt = productType || null;
  const typeBadge = pt
    ? `
        <span class="ov-type-badge" data-type="${escapeHtml(pt.type)}" title="${escapeHtml(pt.description || "")}">
          <span class="ov-type-icon">${escapeHtml(pt.icon || "◆")}</span>
          <span class="ov-type-label">${escapeHtml(pt.label)}</span>
          <span class="ov-type-tagline">${escapeHtml(pt.tagline || "")}</span>
        </span>`
    : "";

  return `
    <div class="ov-hero">
      <div class="ov-hero-glow"></div>
      <div class="ov-hero-body">
        <div class="ov-hero-eyebrow">
          <span class="ov-hero-dot"></span>
          <span>Product Overview</span>
          ${status ? `<span class="ov-hero-status">${escapeHtml(status)}</span>` : ""}
          ${typeBadge}
        </div>
        <h2 class="ov-hero-title">${escapeHtml(title)}</h2>
        ${vision ? `<p class="ov-hero-vision">${escapeHtml(vision)}</p>` : ""}
        <div class="ov-hero-meta">
          <span class="ov-hero-meta-item"><span class="ov-hero-meta-icon">⎇</span>${escapeHtml(branch)}</span>
          ${git?.commit ? `<span class="ov-hero-meta-item"><span class="ov-hero-meta-icon">◈</span>${escapeHtml(git.commit)}</span>` : ""}
          ${git?.mergedFrom ? `<span class="ov-hero-meta-item"><span class="ov-hero-meta-icon">⇄</span>merged from ${escapeHtml(git.mergedFrom)}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

/* KPI strip — the headline numbers, presented as a single unified band. */
function renderOverviewKpis(onboarding, git, summary) {
  const goals = summary?.goals || [];
  const users = summary?.targetUsers || [];
  const arch = summary?.architecture || [];

  const verified = onboarding?.verifiedFeatures || [];
  const retro = onboarding?.retroactiveFeatures || [];
  const missing = onboarding?.missing || [];
  const deferred = onboarding?.deferred || [];

  const kpis = [
    {
      label: "Product Status",
      value: summary?.status || "—",
      sub: summary?.title ? "product plan approved" : "no product plan",
      tone: summary?.status ? "green" : "slate",
      icon: "◈"
    },
    {
      label: "Primary Goals",
      value: String(goals.length),
      sub: goals.length ? "confirmed" : "none recorded",
      tone: "blue",
      icon: "✦"
    },
    {
      label: "Target Users",
      value: String(users.length),
      sub: users.length ? users.map((u) => u.segment).join(" · ") : "none recorded",
      tone: "blue",
      icon: "◉"
    },
    {
      label: "Tech Stack",
      value: String(arch.length),
      sub: arch.length ? "layers documented" : "none recorded",
      tone: "slate",
      icon: "⌘"
    },
    {
      label: "Verified Features",
      value: String(verified.length),
      sub: `${retro.length} retroactive`,
      tone: "green",
      icon: "✓"
    },
    {
      label: "Attention",
      value: String(missing.length + deferred.length),
      sub: missing.length ? `${missing.length} missing · ${deferred.length} deferred` : "all clear",
      tone: missing.length ? "red" : deferred.length ? "amber" : "green",
      icon: "!"
    }
  ];

  return `
    <div class="ov-kpi-strip">
      ${kpis
        .map(
          (k) => `
        <div class="ov-kpi tone-${k.tone}">
          <span class="ov-kpi-icon">${k.icon}</span>
          <span class="ov-kpi-value">${escapeHtml(k.value)}</span>
          <span class="ov-kpi-label">${escapeHtml(k.label)}</span>
          <span class="ov-kpi-sub">${escapeHtml(k.sub)}</span>
        </div>`
        )
        .join("")}
    </div>
  `;
}

/* Grouped panels — product plan, repository, onboarding. */
function renderOverviewPanels(onboarding, git, summary) {
  const sidePanels = [];
  sidePanels.push(renderRepositoryPanel(git));
  if (summary) sidePanels.push(renderOpenQuestionsPanel(summary));
  if (onboarding) sidePanels.push(renderOnboardingPanel(onboarding));

  const mainPanel = summary ? renderProductPlanPanel(summary) : "";

  return `
    <div class="ov-panels">
      <div class="ov-col ov-col-main">${mainPanel}</div>
      <div class="ov-col ov-col-side">${sidePanels.join("")}</div>
    </div>
  `;
}

function renderProductPlanPanel(summary) {
  const goals = summary.goals || [];
  const nonGoals = summary.nonGoals || [];
  const users = summary.targetUsers || [];
  const guidance = summary.guidance || [];
  const arch = summary.architecture || [];

  const bulletList = (items, icon) =>
    items.length
      ? `<ul class="detail-list">${items
          .map((i) => `<li><span>${icon}</span><span>${escapeHtml(i)}</span></li>`)
          .join("")}</ul>`
      : `<div class="ov-empty">None</div>`;

  return `
    <section class="ov-panel">
      <header class="ov-panel-head">
        <span class="ov-panel-icon">◇</span>
        <h3>Product Plan</h3>
      </header>
      <div class="ov-panel-body">
        ${summary.problem ? `<div class="ov-callout"><span class="ov-callout-label">Problem</span><p>${escapeHtml(summary.problem)}</p></div>` : ""}
        <div class="detail-grid">
          <div>
            <div class="detail-block-label">Goals</div>
            ${bulletList(goals, "✓")}
          </div>
          <div>
            <div class="detail-block-label">Non-Goals</div>
            ${bulletList(nonGoals, "✕")}
          </div>
          <div>
            <div class="detail-block-label">Target Users</div>
            ${
              users.length
                ? `<ul class="detail-list">${users
                    .map(
                      (u) =>
                        `<li><span>◉</span><span><span class="li-key">${escapeHtml(u.segment)}</span>${
                          u.need ? ` <span class="li-meta">${escapeHtml(u.need)}</span>` : ""
                        }</span></li>`
                    )
                    .join("")}</ul>`
                : `<div class="ov-empty">None</div>`
            }
          </div>
          <div>
            <div class="detail-block-label">Confirmed Guidance</div>
            ${bulletList(guidance, "▸")}
          </div>
          <div>
            <div class="detail-block-label">Architecture</div>
            ${bulletList(arch, "⌘")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderOpenQuestionsPanel(summary) {
  const openQuestions = summary?.openQuestions || [];
  if (!openQuestions.length) return "";

  return `
    <section class="ov-panel">
      <header class="ov-panel-head">
        <span class="ov-panel-icon">?</span>
        <h3>Open Questions</h3>
        <span class="ov-panel-tag">${openQuestions.length}</span>
      </header>
      <div class="ov-panel-body">
        <ul class="detail-list">
          ${openQuestions
            .map((q) => `<li><span>?</span><span>${escapeHtml(q)}</span></li>`)
            .join("")}
        </ul>
      </div>
    </section>
  `;
}

function renderRepositoryPanel(git) {
  const rows = [
    { label: "Branch", value: git?.branch || "—" },
    { label: "Commit", value: git?.commit || "—" },
    { label: "Merged From", value: git?.mergedFrom || "—" },
    { label: "Working Tree", value: git?.dirty ? "Uncommitted changes" : "Clean" }
  ];

  return `
    <section class="ov-panel">
      <header class="ov-panel-head">
        <span class="ov-panel-icon">⎇</span>
        <h3>Repository</h3>
      </header>
      <div class="ov-panel-body">
        <dl class="ov-facts">
          ${rows
            .map(
              (r) => `
            <div class="ov-fact">
              <dt>${escapeHtml(r.label)}</dt>
              <dd>${escapeHtml(r.value)}</dd>
            </div>`
            )
            .join("")}
        </dl>
      </div>
    </section>
  `;
}

function renderOnboardingPanel(onboarding) {
  const missing = onboarding.missing || [];
  const deferred = onboarding.deferred || [];
  const migrated = onboarding.migrated || [];
  const skipped = onboarding.skipped || [];

  const list = (items, icon, render) =>
    items.length
      ? `<ul class="detail-list">${items.map((i) => `<li><span>${icon}</span><span>${render(i)}</span></li>`).join("")}</ul>`
      : `<div class="ov-empty">None</div>`;

  return `
    <section class="ov-panel">
      <header class="ov-panel-head">
        <span class="ov-panel-icon">◈</span>
        <h3>Onboarding</h3>
        <span class="ov-panel-tag">${escapeHtml(formatDate(onboarding.date))}</span>
      </header>
      <div class="ov-panel-body">
        <div class="detail-grid">
          <div>
            <div class="detail-block-label">Missing</div>
            ${list(missing, "✕", (m) => escapeHtml(m))}
          </div>
          <div>
            <div class="detail-block-label">Deferred</div>
            ${list(deferred, "⏸", (m) => escapeHtml(m))}
          </div>
          <div>
            <div class="detail-block-label">Migrated Features</div>
            ${list(
              migrated,
              "▸",
              (m) => {
                const src = m.from === "openspec" ? "OpenSpec" : m.from === "speckit" ? "Spec-Kit" : m.from;
                return `<span class="li-key">${escapeHtml(m.feature)}</span> <span class="li-meta">from ${escapeHtml(src)}</span>`;
              }
            )}
          </div>
          <div>
            <div class="detail-block-label">Skipped Migrations</div>
            ${list(
              skipped,
              "⏭",
              (s) => {
                const sys = s.system === "openspec" ? "OpenSpec" : s.system === "speckit" ? "Spec-Kit" : s.system;
                return `<span class="li-key">${escapeHtml(sys)}</span>${s.reason ? ` <span class="li-meta">${escapeHtml(s.reason)}</span>` : ""}`;
              }
            )}
          </div>
        </div>
        ${onboarding.notes ? `<div class="ov-callout"><span class="ov-callout-label">Notes</span><p>${escapeHtml(onboarding.notes)}</p></div>` : ""}
      </div>
    </section>
  `;
}

/* ============================================================
   PRODUCT PLAN
   ============================================================ */
function renderProduct(product) {
  const div = document.createElement("div");

  if (!product || !product.exists) {
    div.className = "panel-loading";
    div.innerHTML = `No product plan yet. Run <code>/sdrive:product-plan</code> to create a product overview, conceptual mockup, roadmap, and feature backlog.`;
    return div;
  }

  const backlog = product.backlog || [];
  const pending = backlog.filter((item) => /pending|backlog/i.test(item.status)).length;
  const deferred = backlog.filter((item) => /deferred/i.test(item.status)).length;

  const backlogRows = backlog.length
    ? backlog
        .map((item) => {
          const tone = /deferred/i.test(item.status)
            ? "slate"
            : /pending|backlog/i.test(item.status)
            ? "amber"
            : "green";
          return `
        <tr>
          <td class="backlog-id">${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.feature)}</td>
          <td>${item.milestone ? `<span class="chip slate">${escapeHtml(item.milestone)}</span>` : "—"}</td>
          <td>${item.priority ? escapeHtml(item.priority) : "—"}</td>
          <td><span class="chip ${tone}">${escapeHtml(item.status)}</span></td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="product-empty">No backlog items yet.</td></tr>`;

  div.innerHTML = `
    <div class="product-plan-wrap">
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

    <div class="product-plan-panel">
      <div class="detail-block-label">Artifacts</div>
      <div class="product-plan-artifacts">
        ${product.overview ? `<span class="artifact-chip">ðŸ“„ overview.md</span>` : ""}
        ${product.mockup ? `<span class="artifact-chip">ðŸ—ºï¸ mockup.md</span>` : ""}
        ${product.designSystem ? `<span class="artifact-chip">ðŸŽ¨ design-system.md</span>` : ""}
        ${product.roadmap ? `<span class="artifact-chip">ðŸ›£ï¸ roadmap.md</span>` : ""}
      </div>

      <div class="table-scroll">
        <table class="backlog-table">
          <thead>
            <tr><th>ID</th><th>Feature</th><th>Milestone</th><th>Priority</th><th>Status</th></tr>
          </thead>
          <tbody>${backlogRows}</tbody>
        </table>
      </div>

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

    <div class="gate-section">
      <div class="gate-section-head">
        <span class="gate-section-label">Gates</span>
        <span class="gate-section-hint" title="Approval checkpoints a feature must clear before it can advance">approval checkpoints</span>
      </div>
      <div class="gate-row">
        ${GATE_DEFS.map((g) => {
          const status = version.gates?.[g.key];
          const meta = gateStatusMeta(status);
          return `<span class="${gateClass(status)}" title="${escapeHtml(
            g.hint
          )}"><span class="gate-icon">${meta.icon}</span>${escapeHtml(
            g.label
          )}<span class="gate-status">${meta.text}</span></span>`;
        }).join("")}
      </div>
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

// Monotonic token used to cancel stale renders. renderFeatures() is async and
// awaits network calls inside its loop, so two overlapping invocations (e.g. a
// <select> firing both `input` and `change`) would each clear the container and
// then both append their cards, producing duplicate cards. Each render claims a
// token; any render that finds the token has moved on aborts before mutating the DOM.
let featureRenderToken = 0;

async function renderFeatures() {
  const token = ++featureRenderToken;

  const state = await fetchJson("/api/workflow-state");
  const team = (await fetchJson("/api/team")) || { members: [] };
  const container = document.getElementById("feature-list");

  if (token !== featureRenderToken) return;

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

      // A newer render started while we were awaiting — abandon this one.
      if (token !== featureRenderToken) return;

      if (!featureMatchesFilters(f, version, filters, verification, tests)) {
        continue;
      }

      body.appendChild(renderVersionBlock(f, version, isCurrent, traceability, verification, tests));
      versionRendered++;
    }

    if (versionRendered > 0) {
      card.appendChild(body);

      // Footer with a "View more" affordance that opens the task-detail overlay.
      const foot = document.createElement("div");
      foot.className = "feature-card-foot";
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "feature-more-btn";
      moreBtn.innerHTML = `View more <span class="feature-more-arrow">→</span>`;
      moreBtn.addEventListener("click", () => openFeatureModal(f, team));
      foot.appendChild(moreBtn);
      card.appendChild(foot);

      container.appendChild(card);
      rendered++;
    }
  }

  if (token !== featureRenderToken) return;

  if (rendered === 0) {
    container.className = "panel-loading";
    container.textContent = "No features match the current filters.";
  }
}

/* ============================================================
   FEATURE DETAIL SHEET
   Opened from the "View more" button on a feature card. Slides in
   from the right and shows the full task breakdown (pending /
   completed) for every version of the feature, grouped by phase.
   ============================================================ */
let featureModalOpen = false;

function openFeatureModal(feature, team) {
  const modal = document.getElementById("feature-modal");
  const title = document.getElementById("feature-modal-title");
  const subtitle = document.getElementById("feature-modal-subtitle");
  const body = document.getElementById("feature-modal-body");
  if (!modal || !body) return;

  title.textContent = feature.name;
  subtitle.textContent = `${feature.currentVersion} · ${feature.phase || ""} · ${feature.currentStep || ""}`;
  body.innerHTML = `<div class="skeleton-card"></div>`;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  featureModalOpen = true;
  document.body.classList.add("modal-open");

  renderFeatureModalBody(feature, team, body);
}

function closeFeatureModal() {
  const modal = document.getElementById("feature-modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  featureModalOpen = false;
  document.body.classList.remove("modal-open");
}

async function renderFeatureModalBody(feature, team, body) {
  const versions = feature.versions || [];
  const frag = document.createDocumentFragment();

  // Summary strip: aggregate task counts across every version.
  let grandTotal = 0;
  let grandDone = 0;
  const versionData = [];

  for (const version of versions) {
    const tasks = (await fetchJson(`/api/tasks/${feature.name}/${version.id}`)) || {
      summary: { total: 0, completed: 0, pending: 0, percent: 0 },
      phases: []
    };
    grandTotal += tasks.summary?.total || 0;
    grandDone += tasks.summary?.completed || 0;
    versionData.push({ version, tasks });
  }

  const grandPending = grandTotal - grandDone;
  const grandPercent = grandTotal === 0 ? 0 : Math.round((grandDone / grandTotal) * 100);

  const summary = document.createElement("div");
  summary.className = "modal-summary";
  summary.innerHTML = `
    <div class="modal-stat">
      <span class="modal-stat-value">${grandTotal}</span>
      <span class="modal-stat-label">Total tasks</span>
    </div>
    <div class="modal-stat">
      <span class="modal-stat-value green">${grandDone}</span>
      <span class="modal-stat-label">Completed</span>
    </div>
    <div class="modal-stat">
      <span class="modal-stat-value amber">${grandPending}</span>
      <span class="modal-stat-label">Pending</span>
    </div>
    <div class="modal-stat">
      <span class="modal-stat-value">${grandPercent}%</span>
      <span class="modal-stat-label">Progress</span>
    </div>
  `;
  frag.appendChild(summary);

  // Assignee / members context.
  const members = featureMembers(feature, team);
  if (feature.assignee || members.length) {
    const meta = document.createElement("div");
    meta.className = "modal-meta";
    const assigneeEl = featureAssigneeEl(feature, team);
    if (assigneeEl) meta.appendChild(assigneeEl);
    if (members.length) meta.appendChild(featureMembersEl(members));
    frag.appendChild(meta);
  }

  for (const { version, tasks } of versionData) {
    const isCurrent = version.id === feature.currentVersion;
    const section = document.createElement("div");
    section.className = "modal-version" + (isCurrent ? " current" : "");

    const s = tasks.summary || { total: 0, completed: 0, pending: 0, percent: 0 };
    const phases = tasks.phases || [];

    section.innerHTML = `
      <div class="modal-version-head">
        <span class="version-id">
          <span class="chip ${isCurrent ? "accent" : "slate"}">${isCurrent ? "current" : "past"}</span>
          ${escapeHtml(version.id)}
        </span>
        <span class="modal-version-counts">
          <span class="chip green">${s.completed} done</span>
          <span class="chip amber">${s.pending} pending</span>
          <span class="chip slate">${s.percent}%</span>
        </span>
      </div>
      ${
        phases.length
          ? phases
              .map(
                (p) => `
        <div class="modal-phase">
          <div class="modal-phase-head">
            <span class="modal-phase-id">${escapeHtml(p.phaseId)}</span>
            <span class="modal-phase-name">${escapeHtml(p.name)}</span>
            <span class="modal-phase-count">${p.completed}/${p.total}</span>
          </div>
          <ul class="modal-task-list">
            ${(p.tasks || [])
              .map(
                (t) => `
              <li class="modal-task ${t.completed ? "done" : "pending"}">
                <span class="modal-task-check">${t.completed ? "✓" : "○"}</span>
                <div class="modal-task-body">
                  <div class="modal-task-title">
                    <span class="modal-task-id">${escapeHtml(t.id)}</span>
                    ${escapeHtml(t.title)}
                  </div>
                  ${
                    t.description
                      ? `<div class="modal-task-desc">${escapeHtml(t.description)}</div>`
                      : ""
                  }
                  ${
                    (t.linkedRequirements || []).length ||
                    (t.linkedAcceptanceCriteria || []).length
                      ? `<div class="modal-task-links">
                          ${(t.linkedRequirements || [])
                            .map((r) => `<span class="chip blue">${escapeHtml(r)}</span>`)
                            .join("")}
                          ${(t.linkedAcceptanceCriteria || [])
                            .map((a) => `<span class="chip slate">${escapeHtml(a)}</span>`)
                            .join("")}
                        </div>`
                      : ""
                  }
                </div>
              </li>
            `
              )
              .join("")}
          </ul>
        </div>
      `
              )
              .join("")
          : `<div class="modal-empty">No tasks recorded for this version.</div>`
      }
    `;
    frag.appendChild(section);
  }

  body.innerHTML = "";
  body.appendChild(frag);
}

function setupFeatureModal() {
  const modal = document.getElementById("feature-modal");
  if (!modal) return;

  const closeBtn = document.getElementById("feature-modal-close");
  if (closeBtn) closeBtn.addEventListener("click", closeFeatureModal);

  modal.querySelectorAll("[data-modal-close]").forEach((el) => {
    el.addEventListener("click", closeFeatureModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && featureModalOpen) closeFeatureModal();
  });
}

/* ============================================================
   TEAM & BRANCH
   ============================================================ */
async function renderTeam() {
  const team = await fetchJson("/api/team");
  const container = document.getElementById("team-list");

  if (!team || !team.members || team.members.length === 0) {
    container.className = "panel-loading";
    container.textContent = "No team members.";
  } else {
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

  await renderBranches();
}

async function renderBranches() {
  const container = document.getElementById("branch-list");
  if (!container) return;

  const data = await fetchJson("/api/branches");

  if (!data || !data.available || !data.branches || data.branches.length === 0) {
    container.className = "panel-loading";
    container.textContent = "No git branches found.";
    return;
  }

  container.className = "branch-list";
  container.innerHTML = "";

  data.branches.forEach((b) => {
    const row = document.createElement("div");
    row.className = "branch-row" + (b.current ? " is-current" : "");

    const statusChip = b.current
      ? `<span class="chip blue">current</span>`
      : b.merged
        ? `<span class="chip green">merged</span>`
        : `<span class="chip amber">active</span>`;

    row.innerHTML = `
      <div class="branch-main">
        <div class="branch-name">
          <span class="branch-icon">⎇</span>${escapeHtml(b.name)}
          ${statusChip}
        </div>
        <div class="branch-subject">${escapeHtml(b.subject || "—")}</div>
      </div>
      <div class="branch-meta">
        <span class="branch-commit">${escapeHtml(b.commit || "")}</span>
        <span class="branch-author">${escapeHtml(b.author || "")}</span>
        <span class="branch-date">${escapeHtml(formatDate(b.committedAt))}</span>
      </div>
    `;
    container.appendChild(row);
  });
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
  const data = await fetchJson("/api/activity");
  const container = document.getElementById("audit-list");

  const events = (data && data.events) || [];

  if (events.length === 0) {
    container.className = "panel-loading";
    container.textContent = "No activity yet.";
    return;
  }

  container.className = "timeline";
  container.innerHTML = "";

  events.slice(0, 40).forEach((e) => {
    const item = document.createElement("div");
    item.className = "timeline-item";

    const details = e.details || {};
    const detailParts = Object.entries(details)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" Â· ");

    const scope = [e.feature, e.version].filter(Boolean).join(" Â· ");

    item.innerHTML = `
      <span class="timeline-dot ${auditTone(e.event)}"></span>
      <div class="timeline-body">
        <div class="timeline-event">${escapeHtml(String(e.event).replace(/[_-]/g, " "))}</div>
        <div class="timeline-meta">${escapeHtml(formatDateTime(e.timestamp))}${
          scope ? ` Â· ${escapeHtml(scope)}` : ""
        }</div>
        ${detailParts ? `<div class="timeline-details">${escapeHtml(detailParts)}</div>` : ""}
      </div>
    `;
    container.appendChild(item);
  });
}

/* ============================================================
   SKILLS
   ============================================================ */
async function renderSkills() {
  const data = await fetchJson("/api/skills");
  const container = document.getElementById("skills-list");
  if (!container) return;

  const skills = (data && data.skills) || [];

  if (skills.length === 0) {
    container.className = "panel-loading";
    container.textContent = "No skills provisioned yet. Run /sdrive:skills to discover and install skills.";
    return;
  }

  container.className = "skills-grid";
  container.innerHTML = "";

  skills.forEach((s) => {
    const card = document.createElement("div");
    card.className = "skill-card";

    const tags = (s.tags || [])
      .map((t) => `<span class="chip slate">${escapeHtml(t)}</span>`)
      .join("");

    const meta = [
      s.version ? `v${s.version}` : "",
      s.installed ? `installed ${formatDate(s.installed)}` : "",
      s.lines ? `${s.lines} lines` : "",
      s.extraFiles ? `${s.extraFiles} extra file${s.extraFiles === 1 ? "" : "s"}` : ""
    ]
      .filter(Boolean)
      .join(" Â· ");

    card.innerHTML = `
      <div class="skill-head">
        ${
          s.logo
            ? `<span class="skill-logo"><img src="${escapeHtml(s.logo)}" alt="${escapeHtml(
                s.name
              )} logo" loading="lazy" /></span>`
            : `<span class="skill-icon">âœ¦</span>`
        }
        <div class="skill-title">
          <div class="skill-name">${escapeHtml(s.name)}</div>
          <div class="skill-folder">.sdrive/skills/${escapeHtml(s.folder)}</div>
        </div>
        ${s.version ? `<span class="skill-version">v${escapeHtml(s.version)}</span>` : ""}
      </div>
      <div class="skill-desc">${escapeHtml(s.description || "No description.")}</div>
      ${tags ? `<div class="chip-list">${tags}</div>` : ""}
      <div class="skill-foot">
        <div class="skill-meta">${escapeHtml(meta)}</div>
        ${s.source ? `<div class="skill-source">${escapeHtml(s.source)}</div>` : ""}
      </div>
    `;
    container.appendChild(card);
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
  const haystack = `${item.command} ${item.description} ${item.group || ""} ${item.what || ""} ${item.why || ""} ${item.when || ""}`.toLowerCase();
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
  const wrap = document.createElement("div");
  wrap.className = "table-scroll";

  const table = document.createElement("table");
  table.className = "command-table";

  const head = document.createElement("thead");
  head.innerHTML = `
    <tr>
      <th class="col-command">Command</th>
      <th>What it does</th>
      <th class="col-meta">Details</th>
    </tr>
  `;
  table.appendChild(head);

  const body = document.createElement("tbody");
  items.forEach((item) => body.appendChild(commandRowEl(item)));
  table.appendChild(body);

  wrap.appendChild(table);
  return wrap;
}

// Returns a DocumentFragment holding the main row plus (when available) a
// hidden detail row that the "Details" button toggles.
function commandRowEl(item) {
  const frag = document.createDocumentFragment();
  const tr = document.createElement("tr");
  tr.className = "command-row";

  const meta = [];
  if (item.acceptsFeature) meta.push(`<span class="chip blue">feature</span>`);
  if (item.acceptsAll) meta.push(`<span class="chip green">--all</span>`);
  if (item.agent) meta.push(`<span class="chip slate">${escapeHtml(item.agent)}</span>`);
  (item.gates || []).forEach((g) => meta.push(`<span class="chip amber">gate: ${escapeHtml(g)}</span>`));
  if (item.optional) meta.push(`<span class="chip optional-chip" title="${escapeHtml(item.optionalNote || "")}">optional</span>`);

  const hasDetail = Boolean(item.what || item.why || item.when || item.example);
  const summary = item.what || item.description;

  tr.innerHTML = `
    <td class="col-command"><code class="command-code" title="Click to copy">${escapeHtml(item.command)}</code></td>
    <td>
      <div class="command-desc">${escapeHtml(summary)}</div>
      ${item.what && item.description ? `<div class="command-sub">${escapeHtml(item.description)}</div>` : ""}
    </td>
    <td class="col-meta">
      ${meta.length ? `<div class="command-meta">${meta.join("")}</div>` : ""}
      ${hasDetail ? `<button class="command-toggle" type="button" aria-expanded="false">Details ▾</button>` : ""}
    </td>
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

  if (hasDetail) {
    const detailRow = document.createElement("tr");
    detailRow.className = "command-detail-row";
    detailRow.hidden = true;

    const cells = [];
    if (item.what) cells.push(detailCell("What it does", item.what));
    if (item.why) cells.push(detailCell("Why it matters", item.why));
    if (item.when) cells.push(detailCell("When to use it", item.when));
    if (item.example) cells.push(detailCell("Example", item.example, true));

    detailRow.innerHTML = `<td colspan="3"><div class="command-detail">${cells.join("")}${
      item.optional && item.optionalNote
        ? `<div class="command-detail-item command-detail-optional"><span class="command-detail-label">Optional</span><span>${escapeHtml(
            item.optionalNote
          )}</span></div>`
        : ""
    }</div></td>`;

    const toggle = tr.querySelector(".command-toggle");
    toggle.addEventListener("click", () => {
      const open = detailRow.hidden;
      detailRow.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Details ▴" : "Details ▾";
    });

    frag.appendChild(tr);
    frag.appendChild(detailRow);
    return frag;
  }

  frag.appendChild(tr);
  return frag;
}

function detailCell(label, value, isCode) {
  const body = isCode
    ? `<code class="command-example">${escapeHtml(value)}</code>`
    : `<span>${escapeHtml(value)}</span>`;
  return `<div class="command-detail-item"><span class="command-detail-label">${escapeHtml(label)}</span>${body}</div>`;
}

function renderWorkflowCards() {
  const container = document.getElementById("workflow-cards");
  if (!container) return;

  const workflows = (commandData && commandData.workflows) || [];
  if (!workflows.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = workflows
    .map(
      (w) => `
    <article class="workflow-card" data-workflow="${escapeHtml(w.id)}">
      <div class="workflow-card-head">
        <span class="workflow-icon">${escapeHtml(w.icon || "◆")}</span>
        <div>
          <h3 class="workflow-name">${escapeHtml(w.name)}</h3>
          <span class="workflow-tagline">${escapeHtml(w.tagline || "")}</span>
        </div>
      </div>
      <p class="workflow-summary">${escapeHtml(w.summary || "")}</p>
      <ol class="workflow-steps">
        ${(w.steps || [])
          .map((s) => {
            const isOptional = (w.optional || []).includes(s);
            return `<li class="${isOptional ? "optional" : ""}"><code>${escapeHtml(
              s
            )}</code>${isOptional ? `<span class="step-optional-badge">optional</span>` : ""}</li>`;
          })
          .join("")}
      </ol>
      ${
        (w.optional || []).length
          ? `<div class="workflow-optional-note"><span class="workflow-optional-icon">✦</span>${escapeHtml(
              w.optionalNote || ""
            )}</div>`
          : ""
      }
      <div class="workflow-bestfor"><span>Best for</span>${escapeHtml(w.bestFor || "")}</div>
    </article>
  `
    )
    .join("");
}

async function renderCommands() {
  const data = await fetchJson("/api/commands");
  commandData = data || { slash: [], cli: [], workflows: [] };

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
  renderWorkflowCards();
}

/* ============================================================
   ROUTER (path-based)
   Each view is its own URL: /overview, /product-plan, /features,
   /team, /activity, /commands. The server serves the same shell
   for every route; here we show the matching section and keep the
   sidebar highlight in sync.
   ============================================================ */
const ROUTES = ["overview", "product-plan", "features", "skills", "team", "activity", "commands"];
const DEFAULT_ROUTE = "overview";

function currentRoute() {
  const path = window.location.pathname.replace(/\/+$/, "");
  const name = path.split("/").pop();
  return ROUTES.includes(name) ? name : DEFAULT_ROUTE;
}

function showRoute(route) {
  const target = ROUTES.includes(route) ? route : DEFAULT_ROUTE;

  document.querySelectorAll(".section").forEach((section) => {
    section.classList.toggle("active", section.id === target);
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.nav === target);
  });

  document.title = `SpecDrive · ${target.charAt(0).toUpperCase()}${target.slice(1)}`;
  window.scrollTo({ top: 0, behavior: "auto" });
}

function setupNav() {
  // Intercept sidebar link clicks so navigation is instant (no full reload)
  // while still updating the URL via the History API.
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      const route = item.dataset.nav;
      if (!ROUTES.includes(route)) return;
      event.preventDefault();
      if (currentRoute() !== route) {
        window.history.pushState({ route }, "", `/${route}`);
      }
      showRoute(route);
      closeSidebarDrawer();
    });
  });

  // Handle browser back/forward.
  window.addEventListener("popstate", () => showRoute(currentRoute()));

  showRoute(currentRoute());
}

/* Mobile off-canvas drawer (shadcn-style sheet). */
function openSidebarDrawer() {
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const toggle = document.getElementById("sidebar-toggle");
  if (sidebar) sidebar.classList.add("open");
  if (backdrop) backdrop.classList.add("open");
  if (toggle) toggle.setAttribute("aria-expanded", "true");
}

function closeSidebarDrawer() {
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const toggle = document.getElementById("sidebar-toggle");
  if (sidebar) sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.remove("open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

function setupSidebarDrawer() {
  const toggle = document.getElementById("sidebar-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const sidebar = document.querySelector(".sidebar");
      if (sidebar && sidebar.classList.contains("open")) {
        closeSidebarDrawer();
      } else {
        openSidebarDrawer();
      }
    });
  }
  if (backdrop) backdrop.addEventListener("click", closeSidebarDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebarDrawer();
  });
}

/* ============================================================
   MAIN
   ============================================================ */
async function main() {
  const [onboarding, product, git, project, productType] = await Promise.all([
    fetchJson("/api/onboarding"),
    fetchJson("/api/product"),
    fetchJson("/api/git-info"),
    fetchJson("/api/project-info"),
    fetchJson("/api/product-type")
  ]);

  renderProjectInfo(project);
  renderGitInfo(git);

  const overviewContainer = document.getElementById("overview-panel");
  if (overviewContainer) {
    overviewContainer.innerHTML = "";
    overviewContainer.appendChild(renderOverview(onboarding, git, product, productType));
  }

  const productContainer = document.getElementById("product-panel");
  if (productContainer) {
    productContainer.innerHTML = "";
    productContainer.appendChild(renderProduct(product));
  }

  // Bind each control to the single event it actually emits. A <select> fires
  // BOTH `input` and `change`, so binding both caused renderFeatures() to run
  // twice per change and race against itself (duplicate cards). Text inputs only
  // emit `input`; selects and checkboxes only need `change`.
  [
    { id: "filter-search", event: "input" },
    { id: "filter-phase", event: "change" },
    { id: "filter-verification", event: "change" },
    { id: "filter-tests", event: "change" },
    { id: "filter-current-version", event: "change" }
  ].forEach(({ id, event }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener(event, renderFeatures);
    }
  });

  setupNav();
  setupSidebarDrawer();
  setupFeatureModal();

  await renderFeatures();
  await renderSkills();
  await renderTeam();
  await renderAudit();
  await renderCommands();
}

main();
