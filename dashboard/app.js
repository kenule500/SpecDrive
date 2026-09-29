async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

function gateClass(status) {
  if (status === "approved") return "gate approved";
  if (status === "in_progress") return "gate in_progress";
  return "gate pending";
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

function renderVerification(verification) {
  const div = document.createElement("div");
  div.className = "traceability";

  if (verification.status === "pass") {
    div.innerHTML = `🔍 Verification: <strong>PASS</strong> (${verification.summary?.matched ?? 0} matched)`;
    div.style.color = "#2b6b25";
  } else if (verification.status === "warn") {
    div.innerHTML = `🔍 Verification: <strong>WARN</strong> (${verification.summary?.extra ?? 0} extra, ${verification.summary?.matched ?? 0} matched)`;
    div.style.color = "#7a5b1a";
  } else if (verification.status === "fail") {
    div.innerHTML = `🔍 Verification: <strong>FAIL</strong> (${verification.summary?.missing ?? 0} missing, ${verification.summary?.renamed ?? 0} renamed)`;
    div.style.color = "#8a1c1c";
  } else {
    div.innerHTML = `🔍 Verification: <strong>NOT RUN</strong>`;
    div.style.color = "#666";
  }

  return div;
}

function renderTests(tests) {
  const div = document.createElement("div");
  div.className = "traceability";

  if (!tests || tests.status === "not_run") {
    div.innerHTML = `🧪 Tests: <strong>NOT RUN</strong>`;
    div.style.color = "#666";
  } else if (tests.status === "complete") {
    div.innerHTML = `🧪 Tests: <strong>${tests.summary.coverage}%</strong> (${tests.summary.testedACs}/${tests.summary.totalACs} ACs, ${tests.summary.passed}/${tests.summary.total} passed)`;
    div.style.color = "#2b6b25";
  } else {
    div.innerHTML = `🧪 Tests: <strong>${tests.summary.coverage}%</strong> (${tests.summary.testedACs}/${tests.summary.totalACs} ACs)`;
    div.style.color = "#7a5b1a";
  }

  return div;
}

function renderVersion(feature, version, isCurrent) {
  const div = document.createElement("div");
  div.className = "feature-version";
  div.style.marginTop = "12px";
  div.style.paddingTop = "12px";
  div.style.borderTop = "1px solid #eee";

  div.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">
      ${isCurrent ? "🟢" : "⚪"} Version: ${version.id}
    </div>
    <div>Phase: ${version.phase} | Step: ${version.currentStep}</div>
    <div style="margin-top: 8px;">
      <span class="${gateClass(version.gates?.specification)}">spec: ${version.gates?.specification}</span>
      <span class="${gateClass(version.gates?.planning)}">plan: ${version.gates?.planning}</span>
      <span class="${gateClass(version.gates?.implementation)}">impl: ${version.gates?.implementation}</span>
      <span class="${gateClass(version.gates?.review)}">review: ${version.gates?.review}</span>
    </div>
  `;

  return div;
}

async function renderFeatures() {
  const state = await fetchJson("/api/workflow-state");
  const container = document.getElementById("feature-list");

  if (!state.features || state.features.length === 0) {
    container.textContent = "No features yet.";
    return;
  }

  const filters = getFilterValues();
  container.innerHTML = "";

  let rendered = 0;

  for (const f of state.features) {
    const featureDiv = document.createElement("div");
    featureDiv.className = "feature";

    featureDiv.innerHTML = `
      <div class="feature-name">${f.name}</div>
      ${f.branch ? `<div class="feature-branch">🌿 ${f.branch}</div>` : ""}
      <div>Current Version: ${f.currentVersion}</div>
    `;

    const versions = f.versions || [];
    let versionRendered = 0;

    for (const version of versions) {
      const isCurrent = version.id === f.currentVersion;

      if (filters.currentVersionOnly && !isCurrent) {
        continue;
      }

      const traceability = await fetchJson(`/api/traceability/${f.name}/${version.id}`);
      const verification = await fetchJson(`/api/verification/${f.name}/${version.id}`);
      const tests = await fetchJson(`/api/tests/${f.name}/${version.id}`);

      if (!featureMatchesFilters(f, version, filters, verification, tests)) {
        continue;
      }

      const rows = traceability.rows || [];
      const completed = rows.filter((r) => r.status === "complete").length;
      const coverage = rows.length === 0 ? 0 : Math.round((completed / rows.length) * 100);

      const versionDiv = renderVersion(f, version, isCurrent);

      const traceLine = document.createElement("div");
      traceLine.className = "traceability";
      traceLine.textContent = `📊 Traceability Coverage: ${coverage}% (${completed}/${rows.length})`;
      versionDiv.appendChild(traceLine);

      versionDiv.appendChild(renderVerification(verification));
      versionDiv.appendChild(renderTests(tests));

      if (version.history) {
        version.history.forEach((h) => {
          if (h.event.endsWith("_approved")) {
            const line = document.createElement("div");
            line.className = "traceability";
            line.textContent = `✅ ${h.event.replace("_approved", "")} approved by ${h.by || "unknown"}`;
            versionDiv.appendChild(line);
          }
        });
      }

      featureDiv.appendChild(versionDiv);
      versionRendered++;
    }

    if (versionRendered > 0) {
      container.appendChild(featureDiv);
      rendered++;
    }
  }

  if (rendered === 0) {
    container.textContent = "No features match the current filters.";
  }
}

async function renderTeam() {
  const team = await fetchJson("/api/team");
  const container = document.getElementById("team-list");

  if (!team.members || team.members.length === 0) {
    container.textContent = "No team members.";
    return;
  }

  container.innerHTML = "";
  team.members.forEach((m) => {
    const div = document.createElement("div");
    div.className = "member";
    div.textContent = `${m.username} — ${m.role}`;
    container.appendChild(div);
  });
}

async function renderAudit() {
  const log = await fetchJson("/api/audit-log");
  const container = document.getElementById("audit-list");

  if (!log.events || log.events.length === 0) {
    container.textContent = "No activity yet.";
    return;
  }

  container.innerHTML = "";
  log.events.slice(-20).reverse().forEach((e) => {
    const div = document.createElement("div");
    div.className = "audit-event";
    div.textContent = `${e.timestamp} — ${e.event}`;
    container.appendChild(div);
  });
}

function renderExternalSystems(detected) {
  if (!detected) return "";

  const parts = [];

  if (detected.openspec?.detected) {
    parts.push(`
      <li>
        <strong>OpenSpec</strong> — ${detected.openspec.specs || 0} specs,
        ${detected.openspec.changes || 0} active changes,
        ${detected.openspec.archived || 0} archived
      </li>
    `);
  }

  if (detected.speckit?.detected) {
    parts.push(`
      <li>
        <strong>Spec-Kit</strong> — ${detected.speckit.specs || 0} specs,
        constitution: ${detected.speckit.hasConstitution ? "found" : "missing"}
      </li>
    `);
  }

  if (parts.length === 0) return "";

  return `
    <div style="margin-top: 12px;">
      <strong>🔎 Detected External Spec Systems</strong>
      <ul>${parts.join("")}</ul>
    </div>
  `;
}

function renderMigrated(migrated) {
  if (!migrated || migrated.length === 0) return "";

  const items = migrated.map((m) => {
    const source = m.from === "openspec" ? "OpenSpec" : m.from === "speckit" ? "Spec-Kit" : m.from;
    return `<li><strong>${m.feature}</strong> — from ${source} (${m.source})</li>`;
  });

  return `
    <div style="margin-top: 12px;">
      <strong>📦 Migrated Features</strong>
      <ul>${items.join("")}</ul>
    </div>
  `;
}

function renderSkipped(skipped) {
  if (!skipped || skipped.length === 0) return "";

  const items = skipped.map((s) => {
    const system = s.system === "openspec" ? "OpenSpec" : s.system === "speckit" ? "Spec-Kit" : s.system;
    const reason = s.reason ? ` — ${s.reason}` : "";
    return `<li><strong>${system}</strong>${reason}</li>`;
  });

  return `
    <div style="margin-top: 12px;">
      <strong>⏭️ Skipped Migrations</strong>
      <ul>${items.join("")}</ul>
    </div>
  `;
}

function renderOnboarding(onboarding) {
  const div = document.createElement("div");
  div.className = "onboarding";

  if (!onboarding) {
    div.innerHTML = `
      <h2>🟢 Greenfield Project</h2>
      <div>Fully SpecDrive-native. No onboarding needed.</div>
    `;
    return div;
  }

  const isPartial = onboarding.missing && onboarding.missing.length > 0;
  const isDeferred = onboarding.deferred && onboarding.deferred.length > 0;

  div.innerHTML = `
    <h2>${isPartial ? "🟡 Brownfield Project — Partial Onboarding" : "🟢 Brownfield Project — Onboarded"}</h2>
    <div>Onboarded: ${new Date(onboarding.date).toLocaleDateString()}</div>

    ${renderExternalSystems(onboarding.detectedSystems)}

    ${
      onboarding.missing && onboarding.missing.length
        ? `
      <div style="margin-top: 12px;">
        <strong>❌ Missing</strong>
        <ul>${onboarding.missing.map((m) => `<li>${m}</li>`).join("")}</ul>
      </div>
    `
        : ""
    }

    ${
      isDeferred
        ? `
      <div style="margin-top: 12px;">
        <strong>⚠️ Deferred</strong>
        <ul>${onboarding.deferred.map((m) => `<li>${m}</li>`).join("")}</ul>
      </div>
    `
        : ""
    }

    ${renderMigrated(onboarding.migrated)}
    ${renderSkipped(onboarding.skipped)}

    <div style="margin-top: 12px;">
      <strong>📊 Coverage</strong>
      <ul>
        <li>Retroactive features: ${onboarding.retroactiveFeatures?.length || 0}</li>
        <li>Verified features: ${onboarding.verifiedFeatures?.length || 0}</li>
      </ul>
    </div>

    ${
      onboarding.notes
        ? `<div style="margin-top: 12px;"><em>${onboarding.notes}</em></div>`
        : ""
    }
  `;

  return div;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderProduct(product) {
  const div = document.createElement("div");
  div.className = "product";

  if (!product || !product.exists) {
    div.innerHTML = `
      <div class="product-empty">
        No product blueprint yet. Run <code>/sdrive:blueprint</code> to create a product overview,
        conceptual mockup, roadmap, and feature backlog.
      </div>
    `;
    return div;
  }

  const backlog = product.backlog || [];
  const pending = backlog.filter((item) => /pending/i.test(item.status)).length;
  const deferred = backlog.filter((item) => /deferred/i.test(item.status)).length;

  const backlogRows = backlog.length
    ? backlog
        .map(
          (item) => `
        <tr>
          <td class="backlog-id">${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.feature)}</td>
          <td><span class="backlog-status ${/pending/i.test(item.status) ? "pending" : /deferred/i.test(item.status) ? "deferred" : "other"}">${escapeHtml(item.status)}</span></td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="product-empty">No backlog items yet.</td></tr>`;

  div.innerHTML = `
    <div class="product-summary">
      <span class="product-stat">📋 Backlog: <strong>${backlog.length}</strong></span>
      <span class="product-stat">⏳ Pending: <strong>${pending}</strong></span>
      <span class="product-stat">💤 Deferred: <strong>${deferred}</strong></span>
    </div>

    <div class="product-artifacts">
      ${product.overview ? `<span class="product-artifact">📄 overview.md</span>` : ""}
      ${product.mockup ? `<span class="product-artifact">🗺️ mockup.md</span>` : ""}
      ${product.designSystem ? `<span class="product-artifact">🎨 design-system.md</span>` : ""}
      ${product.roadmap ? `<span class="product-artifact">🛣️ roadmap.md</span>` : ""}
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
  `;

  return div;
}

async function main() {
  const onboarding = await fetchJson("/api/onboarding");
  const onboardingContainer = document.getElementById("onboarding-panel");

  if (onboardingContainer) {
    onboardingContainer.innerHTML = "";
    onboardingContainer.appendChild(renderOnboarding(onboarding));
  }

  const product = await fetchJson("/api/product");
  const productContainer = document.getElementById("product-panel");

  if (productContainer) {
    productContainer.innerHTML = "";
    productContainer.appendChild(renderProduct(product));
  }

  // Attach filter listeners
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

  await renderFeatures();
  await renderTeam();
  await renderAudit();
}

main();