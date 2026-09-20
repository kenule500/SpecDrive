async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

function gateClass(status) {
  if (status === "approved") return "gate approved";
  if (status === "in_progress") return "gate in_progress";
  return "gate pending";
}

function renderVerification(feature, verification) {
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

async function renderFeatures() {
  const state = await fetchJson("/api/workflow-state");
  const container = document.getElementById("feature-list");

  if (!state.features || state.features.length === 0) {
    container.textContent = "No features yet.";
    return;
  }

  container.innerHTML = "";

  for (const f of state.features) {
    const traceability = await fetchJson(`/api/traceability/${f.name}`);
    const verification = await fetchJson(`/api/verification/${f.name}`);

    const rows = traceability.rows || [];
    const completed = rows.filter((r) => r.status === "complete").length;
    const coverage = rows.length === 0 ? 0 : Math.round((completed / rows.length) * 100);

    const div = document.createElement("div");
    div.className = "feature";
    div.innerHTML = `
      <div class="feature-name">${f.name}</div>
      ${f.branch ? `<div class="feature-branch">🌿 ${f.branch}</div>` : ""}
      <div>Phase: ${f.phase} | Step: ${f.currentStep}</div>
      <div style="margin-top: 8px;">
        <span class="${gateClass(f.gates?.specification)}">spec: ${f.gates?.specification}</span>
        <span class="${gateClass(f.gates?.planning)}">plan: ${f.gates?.planning}</span>
        <span class="${gateClass(f.gates?.implementation)}">impl: ${f.gates?.implementation}</span>
        <span class="${gateClass(f.gates?.review)}">review: ${f.gates?.review}</span>
      </div>
      <div class="traceability">📊 Traceability Coverage: ${coverage}% (${completed}/${rows.length})</div>
    `;

    div.appendChild(renderVerification(f.name, verification));

    if (f.history) {
      f.history.forEach((h) => {
        if (h.event.endsWith("_approved")) {
          const line = document.createElement("div");
          line.className = "traceability";
          line.textContent = `✅ ${h.event.replace("_approved", "")} approved by ${h.by || "unknown"}`;
          div.appendChild(line);
        }
      });
    }

    container.appendChild(div);
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

async function main() {
  await renderFeatures();
  await renderTeam();
  await renderAudit();
}

main();