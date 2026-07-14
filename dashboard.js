/* =========================================================================
   SOPA — Análises: KPIs para o diretor + montagem dos painéis
   ========================================================================= */

function monthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(iso) {
  const d = new Date(iso);
  const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${label}/${String(d.getFullYear()).slice(2)}`;
}

const Dashboard = {
  render() {
    const tasks = Store.all();

    this.renderMetrics(tasks);
    this.renderThroughput(tasks);
    this.renderPriority(tasks);
    this.renderAging(tasks);
    this.renderWorkload(tasks);
    this.renderTrend(tasks);
    this.renderTreemap(tasks);
    this.renderTopRequesters(tasks);
    this.renderTopSectors(tasks);
    this.renderMonthlyHistory(tasks);
    this.renderOverdueTable(tasks);

    document.getElementById("dash-updated-time").textContent =
      new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  },

  renderMetrics(tasks) {
    const now = new Date();
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "concluido");
    const backlog = tasks.filter((t) => t.status === "aberto");
    const inProgress = tasks.filter((t) => t.status === "andamento");
    const active = tasks.filter((t) => t.status !== "concluido");
    const overdue = active.filter((t) => t.dueAt && new Date(t.dueAt) < now);
    const criticalOpen = active.filter((t) => t.priority === "alta");

    const completionRate = total ? Math.round((completed.length / total) * 100) : 0;

    const resolutionHours = completed
      .filter((t) => t.completedAt)
      .map((t) => businessHoursBetween(t.createdAt, t.completedAt));
    const avgResolutionHours = resolutionHours.length
      ? Math.round((resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length) * 10) / 10
      : 0;

    const backlogAges = backlog.map((t) => (now - new Date(t.createdAt)) / 86400000);
    const avgBacklogAge = backlogAges.length ? Math.round(backlogAges.reduce((a, b) => a + b, 0) / backlogAges.length) : 0;

    const withDue = tasks.filter((t) => t.dueAt);
    const under24h = withDue.filter((t) => (new Date(t.dueAt) - new Date(t.createdAt)) / 3600000 < 24);
    const under24hPct = withDue.length ? Math.round((under24h.length / withDue.length) * 100) : 0;

    const last7 = completed.filter((t) => (now - new Date(t.completedAt)) / 86400000 <= 7).length;
    const prev7 = completed.filter((t) => {
      const d = (now - new Date(t.completedAt)) / 86400000;
      return d > 7 && d <= 14;
    }).length;
    const throughputDelta = prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100);

    // mês corrente (até hoje) vs. mesmo intervalo do mesmo mês no ano anterior
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastYearMonthStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const lastYearMonthCutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59);
    const thisMonthCount = tasks.filter((t) => {
      const d = new Date(t.createdAt);
      return d >= thisMonthStart && d <= now;
    }).length;
    const lastYearMonthCount = tasks.filter((t) => {
      const d = new Date(t.createdAt);
      return d >= lastYearMonthStart && d <= lastYearMonthCutoff;
    }).length;
    const yoyDelta = lastYearMonthCount === 0
      ? (thisMonthCount > 0 ? 100 : 0)
      : Math.round(((thisMonthCount - lastYearMonthCount) / lastYearMonthCount) * 100);

    const tiles = [
      { value: total, unit: "", label: "Total de solicitações" },
      { value: completionRate, unit: "%", label: "Taxa de conclusão" },
      { value: inProgress.length, unit: "", label: "Em andamento agora" },
      { value: overdue.length, unit: "", label: "Solicitações em atraso", alert: overdue.length > 0 },
      { value: avgResolutionHours, unit: "h", label: "Resolução média (horário útil)" },
      {
        value: last7, unit: "/sem", label: "Throughput semanal",
        trend: throughputDelta > 0 ? "up" : throughputDelta < 0 ? "down" : "flat",
        trendLabel: (throughputDelta > 0 ? "+" : "") + throughputDelta + "%",
      },
      { value: criticalOpen.length, unit: "", label: "Críticas em aberto", alert: criticalOpen.length > 0 },
      { value: avgBacklogAge, unit: "d", label: "Idade média do backlog" },
      { value: under24hPct, unit: "%", label: "Prazo inferior a 24h", alert: under24hPct >= 30 },
      { value: (yoyDelta > 0 ? "+" : "") + yoyDelta, unit: "%", label: "Variação mensal vs. ano anterior" },
    ];

    const grid = document.getElementById("metric-grid");
    grid.innerHTML = tiles.map((t) => `
      <div class="metric-tile ${t.alert ? "is-alert" : ""}">
        <div class="metric-value-row">
          <span class="metric-value">${t.value}</span>
          ${t.unit ? `<span class="metric-unit">${t.unit}</span>` : ""}
          ${t.trend ? `<span class="metric-trend is-${t.trend}">${t.trend === "up" ? "▲" : t.trend === "down" ? "▼" : "—"} ${t.trendLabel || ""}</span>` : ""}
        </div>
        <div class="metric-label">${t.label}</div>
      </div>
    `).join("");
  },

  renderThroughput(tasks) {
    const weeks = 8;
    const now = new Date();
    const data = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const start = w * 7;
      const end = start + 6;
      const count = tasks.filter((t) => {
        if (t.status !== "concluido") return false;
        const d = (now - new Date(t.completedAt)) / 86400000;
        return d >= start && d <= end;
      }).length;
      const label = w === 0 ? "atual" : `-${w}sem`;
      data.push({ label, value: count });
    }
    barChartVertical(document.getElementById("chart-throughput"), data, { color: "var(--status-concluido)" });
  },

  renderPriority(tasks) {
    const active = tasks.filter((t) => t.status !== "concluido");
    const order = ["alta", "media", "baixa"];
    const data = order.map((p) => ({
      label: PRIORITIES[p].label,
      segments: [
        { name: "Abertas", value: active.filter((t) => t.priority === p && t.status === "aberto").length, color: "var(--status-aberto)" },
        { name: "Em andamento", value: active.filter((t) => t.priority === p && t.status === "andamento").length, color: "var(--status-andamento)" },
      ],
    }));
    barChartHorizontalStacked(document.getElementById("chart-priority"), data);
    setLegend("panel-priority", [
      ["Abertas", "var(--status-aberto)"],
      ["Em andamento", "var(--status-andamento)"],
    ]);
  },

  renderAging(tasks) {
    const now = new Date();
    const backlog = tasks.filter((t) => t.status === "aberto");
    const buckets = [
      { label: "0–2 dias", test: (d) => d <= 2 },
      { label: "3–5 dias", test: (d) => d >= 3 && d <= 5 },
      { label: "6–10 dias", test: (d) => d >= 6 && d <= 10 },
      { label: "11–20 dias", test: (d) => d >= 11 && d <= 20 },
      { label: "21+ dias", test: (d) => d >= 21 },
    ];
    const data = buckets.map((b) => ({
      label: b.label,
      value: backlog.filter((t) => b.test((now - new Date(t.createdAt)) / 86400000)).length,
    }));
    barChartHorizontal(document.getElementById("chart-aging"), data, { color: "var(--accent)" });
  },

  renderWorkload(tasks) {
    const data = ASSIGNEES.map((name) => {
      const mine = tasks.filter((t) => t.assignee === name);
      return {
        label: name.split(" ")[0],
        total: mine.length,
        segments: [
          { name: "Abertas", value: mine.filter((t) => t.status === "aberto").length, color: "var(--status-aberto)" },
          { name: "Em andamento", value: mine.filter((t) => t.status === "andamento").length, color: "var(--status-andamento)" },
          { name: "Concluídas", value: mine.filter((t) => t.status === "concluido").length, color: "var(--status-concluido)" },
        ],
      };
    }).sort((a, b) => b.total - a.total);

    barChartHorizontalStacked(document.getElementById("chart-workload"), data, { barHeight: 22, gap: 14 });
    setLegend("panel-workload", [
      ["Abertas", "var(--status-aberto)"],
      ["Em andamento", "var(--status-andamento)"],
      ["Concluídas", "var(--status-concluido)"],
    ]);

    if (data.length === 2 && data[1].total > 0) {
      const [top, bottom] = data;
      const diffPct = Math.round(((top.total - bottom.total) / bottom.total) * 100);
      setNote("panel-workload", `${top.label} tem ${diffPct}% mais solicitações do que ${bottom.label} (${top.total} vs. ${bottom.total}).`);
    }
  },

  renderTrend(tasks) {
    const days = 30;
    const now = new Date();
    let running = tasks.filter((t) => t.status === "concluido" && (now - new Date(t.completedAt)) / 86400000 > days - 1).length;
    const data = [];
    for (let d = days - 1; d >= 0; d--) {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() - d);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      running += tasks.filter((t) => t.status === "concluido" && new Date(t.completedAt) >= dayStart && new Date(t.completedAt) < dayEnd).length;
      data.push({ label: `${String(dayStart.getDate()).padStart(2, "0")}/${String(dayStart.getMonth() + 1).padStart(2, "0")}`, value: running });
    }
    lineChart(document.getElementById("chart-trend"), data, { color: "var(--accent)" });
  },

  renderTreemap(tasks) {
    const counts = new Map();
    tasks.forEach((t) => counts.set(t.category, (counts.get(t.category) || 0) + 1));
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 15).map(([label, value]) => ({ label, value }));
    const restTotal = sorted.slice(15).reduce((s, [, v]) => s + v, 0);
    if (restTotal > 0) top.push({ label: "Outros", value: restTotal });
    treemapChart(document.getElementById("chart-treemap"), top, { color: "var(--accent)" });
  },

  renderTopRequesters(tasks) {
    const counts = new Map();
    tasks.forEach((t) => counts.set(t.requesterName, (counts.get(t.requesterName) || 0) + 1));
    const data = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
    barChartHorizontal(document.getElementById("chart-top-requesters"), data, { color: "var(--accent)" });
  },

  renderTopSectors(tasks) {
    const bySector = new Map();
    tasks.forEach((t) => {
      if (!bySector.has(t.requesterSector)) bySector.set(t.requesterSector, []);
      bySector.get(t.requesterSector).push(t);
    });
    const top5 = [...bySector.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5);

    const data = top5.map(([sector, list]) => ({
      label: sector,
      segments: [
        { name: "Alta", value: list.filter((t) => t.priority === "alta").length, color: "var(--priority-alta)" },
        { name: "Média", value: list.filter((t) => t.priority === "media").length, color: "var(--priority-media)" },
        { name: "Baixa", value: list.filter((t) => t.priority === "baixa").length, color: "var(--priority-baixa)" },
      ],
    }));
    barChartHorizontalStacked(document.getElementById("chart-top-sectors"), data, { barHeight: 24, gap: 16 });
    setLegend("panel-top-sectors", [
      ["Alta", "var(--priority-alta)"],
      ["Média", "var(--priority-media)"],
      ["Baixa", "var(--priority-baixa)"],
    ]);
  },

  renderMonthlyHistory(tasks) {
    const months = 7;
    const now = new Date();
    const data = [];
    for (let m = months - 1; m >= 0; m--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const key = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
      const count = tasks.filter((t) => monthKey(t.createdAt) === key).length;
      data.push({ label: monthLabel(ref.toISOString()), value: count });
    }
    barChartVertical(document.getElementById("chart-monthly"), data, { color: "var(--accent)" });
  },

  renderOverdueTable(tasks) {
    const now = new Date();
    const overdue = tasks
      .filter((t) => t.status !== "concluido" && t.dueAt && new Date(t.dueAt) < now)
      .map((t) => ({ ...t, hoursLate: Math.round((now - new Date(t.dueAt)) / 3600000) }))
      .sort((a, b) => b.hoursLate - a.hoursLate);

    const container = document.getElementById("table-overdue");
    if (overdue.length === 0) {
      container.innerHTML = `<p class="empty-note">Nenhuma solicitação em atraso — operação em dia.</p>`;
      return;
    }

    const statusMap = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Solicitação</th>
            <th>Setor</th>
            <th>Prioridade</th>
            <th>Status</th>
            <th>Atraso</th>
          </tr>
        </thead>
        <tbody>
          ${overdue.map((t) => `
            <tr>
              <td class="mono">${t.code}</td>
              <td>${escapeHtml(t.title)}</td>
              <td>${escapeHtml(t.requesterSector)}</td>
              <td><span class="tag"><span class="tag-dot" style="background:${PRIORITIES[t.priority].color}"></span>${PRIORITIES[t.priority].label}</span></td>
              <td><span class="tag"><span class="tag-dot" style="background:${statusMap[t.status].color}"></span>${statusMap[t.status].label}</span></td>
              <td class="mono">${t.hoursLate < 24 ? t.hoursLate + "h" : Math.round(t.hoursLate / 24) + "d"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  },
};

function setNote(panelId, text) {
  const panel = document.getElementById(panelId);
  let note = panel.querySelector(".panel-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "panel-note";
    panel.appendChild(note);
  }
  note.textContent = text;
}

function setLegend(panelId, items) {
  const panel = document.getElementById(panelId);
  let legend = panel.querySelector(".legend");
  if (!legend) {
    legend = document.createElement("div");
    legend.className = "legend";
    panel.appendChild(legend);
  }
  legend.innerHTML = items.map(([label, color]) =>
    `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${label}</span>`
  ).join("");
}
