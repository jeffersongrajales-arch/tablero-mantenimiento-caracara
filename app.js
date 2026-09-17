const state = {
  rows: [],
  filtered: [],
  meta: null,
  page: "executive",
  filters: {
    scope: "strict",
    Fiscal_Year: "",
    Period_Number: "",
    station_label: "",
    Profit_Center_Name: "",
    Functional_Area_Name: "",
    Account_Name: "",
    Wo_Type: "",
    Vendor_Name: "",
    Functional_Location: "",
    Gross_Indicator: "",
    search: "",
  },
};

const ids = {
  scope: "scopeFilter",
  Fiscal_Year: "yearFilter",
  Period_Number: "monthFilter",
  station_label: "stationFilter",
  Profit_Center_Name: "profitFilter",
  Functional_Area_Name: "areaFilter",
  Account_Name: "accountFilter",
  Wo_Type: "woTypeFilter",
  Vendor_Name: "vendorFilter",
  Functional_Location: "flocFilter",
  Gross_Indicator: "grossFilter",
};

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("es-CO");
const percent = new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 });

function $(selector) {
  return document.querySelector(selector);
}

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function amount(row) {
  return Number(row.Amount_In_Usd || 0);
}

function validText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function cleanCell(value) {
  if (value === undefined || value === null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (!text || ["nan", "none", "nat"].includes(text.toLowerCase())) return "";
  if (/^\d+\.0$/.test(text)) return text.slice(0, -2);
  return text;
}

function normalizeUploadedRows(rawRows) {
  const expandedNames = new Set([
    "Repairs & Maintenance",
    "Preventative Maintenance",
    "General Maintenance",
    "Downhole Well Maintenance",
  ]);
  return rawRows.map((raw) => {
    const row = {};
    for (const [key, value] of Object.entries(raw)) {
      row[key] = key === "Amount_In_Usd" ? Number(value) || 0 : cleanCell(value);
    }
    const level3 = cleanCell(row["Level 3 (Summ FS)"]);
    const area = cleanCell(row.Functional_Area_Name);
    const wo = cleanCell(row.Wo_Number);
    row.scope_strict = level3 === "Maintenance costs";
    row.scope_expanded = expandedNames.has(area);
    row.wo_valid = Boolean(wo && wo !== "0");
    row.has_vendor = Boolean(cleanCell(row.Vendor_Number));
    row.has_floc = Boolean(cleanCell(row.Functional_Location));
    row.has_system = Boolean(cleanCell(row.Floc_System_Level4));
    row.has_wbs = Boolean(cleanCell(row.Wbs_Element_Code));
    row.month_label = cleanCell(row.Period_Number) ? `P${cleanCell(row.Period_Number).padStart(3, "0")}` : "";
    row.station_label = cleanCell(row.Field) || cleanCell(row.Cost_Center_Name) || cleanCell(row.Profit_Center_Name) || "Sin clasificar";
    return row;
  }).filter((row) => row.scope_strict || row.scope_expanded);
}

function buildUploadedMeta(rows, fileName) {
  const dateValues = rows.map((r) => cleanCell(r.Posting_Date)).filter(Boolean).sort();
  const qualityFields = ["Wo_Number", "Vendor_Number", "Functional_Location", "Floc_System_Level4", "Floc_Segment_Level3", "Cost_Center_Name", "Field", "Department", "ACTIVIDAD", "Wbs_Element_Code"];
  return {
    source: fileName,
    source_sheet: "Data",
    grain: "Linea de documento contable SAP",
    generated_at: new Date().toISOString().slice(0, 16).replace("T", " "),
    rows: rows.length,
    strict_rows: rows.filter(isStrict).length,
    expanded_rows: rows.filter(isExpanded).length,
    quality: qualityFields.map((field) => {
      const present = rows.filter((r) => validText(r[field]) && String(r[field]).trim() !== "0").length;
      return { field, present, missing: rows.length - present, coverage: rows.length ? present / rows.length : 0 };
    }),
    posting_min: dateValues[0] || "",
    posting_max: dateValues[dateValues.length - 1] || "",
    etl_max: "Archivo cargado por usuario",
    partial_period: "009",
  };
}

function isStrict(row) {
  return row.scope_strict === true;
}

function isExpanded(row) {
  return row.scope_expanded === true;
}

function isSelectedScope(row) {
  return state.filters.scope === "strict" ? isStrict(row) : isStrict(row) || isExpanded(row);
}

function sum(rows, selector = amount) {
  return rows.reduce((acc, row) => acc + selector(row), 0);
}

function uniq(rows, key, limit = 600) {
  const values = Array.from(
    new Set(rows.map((row) => row[key]).filter((value) => validText(value))),
  ).sort((a, b) => String(a).localeCompare(String(b), "es"));
  return values.slice(0, limit);
}

function groupSum(rows, key, options = {}) {
  const { validOnly = false, includeBlank = false } = options;
  const map = new Map();
  for (const row of rows) {
    let label = row[key];
    if (!validText(label)) {
      if (!includeBlank) continue;
      label = "Sin dato";
    }
    if (validOnly && String(label).trim() === "0") continue;
    map.set(label, (map.get(label) || 0) + amount(row));
  }
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function groupCount(rows, key, options = {}) {
  const { includeBlank = false, validOnly = false } = options;
  const map = new Map();
  for (const row of rows) {
    let label = row[key];
    if (!validText(label)) {
      if (!includeBlank) continue;
      label = "Sin dato";
    }
    if (validOnly && String(label).trim() === "0") continue;
    map.set(label, (map.get(label) || 0) + 1);
  }
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function metrics(rows) {
  const net = sum(rows);
  const positive = sum(rows.filter((row) => amount(row) > 0));
  const negative = sum(rows.filter((row) => amount(row) < 0));
  const validWoRows = rows.filter((row) => row.wo_valid);
  const vendorRows = rows.filter((row) => row.has_vendor);
  const flocRows = rows.filter((row) => row.has_floc);
  const noWo = rows.filter((row) => !row.wo_valid);
  const top20 = groupSum(rows, "Cost_Center_Name").slice(0, 20);
  const top20Share = net ? sum(top20, (row) => row.value) / net : 0;
  return {
    net,
    positive,
    negative,
    rows: rows.length,
    woPct: rows.length ? validWoRows.length / rows.length : 0,
    vendorPct: rows.length ? vendorRows.length / rows.length : 0,
    flocPct: rows.length ? flocRows.length / rows.length : 0,
    noWoCost: sum(noWo),
    top20Share,
  };
}

function optionize(select, values, labelAll = "Todos") {
  const current = select.value;
  select.innerHTML = "";
  select.append(new Option(labelAll, ""));
  for (const value of values) select.append(new Option(value, value));
  select.value = values.includes(current) ? current : "";
}

function populateFilters() {
  const scoped = state.rows.filter(isSelectedScope);
  optionize($(ids.Fiscal_Year), uniq(scoped, "Fiscal_Year"), "Todos");
  optionize($(ids.Period_Number), uniq(scoped, "Period_Number"), "Todos");
  optionize($(ids.station_label), uniq(scoped, "station_label"), "Todos");
  optionize($(ids.Profit_Center_Name), uniq(scoped, "Profit_Center_Name"), "Todos");
  optionize($(ids.Functional_Area_Name), uniq(scoped, "Functional_Area_Name"), "Todas");
  optionize($(ids.Account_Name), uniq(scoped, "Account_Name"), "Todas");
  optionize($(ids.Wo_Type), uniq(scoped, "Wo_Type"), "Todos");
  optionize($(ids.Vendor_Name), uniq(scoped, "Vendor_Name"), "Todos");
  optionize($(ids.Functional_Location), uniq(scoped, "Functional_Location"), "Todas");
  optionize($(ids.Gross_Indicator), uniq(scoped, "Gross_Indicator"), "Todos");
}

function applyFilters() {
  const search = state.filters.search.toLowerCase();
  state.filtered = state.rows.filter((row) => {
    if (!isSelectedScope(row)) return false;
    for (const [key, value] of Object.entries(state.filters)) {
      if (!value || key === "scope" || key === "search") continue;
      if (row[key] !== value) return false;
    }
    if (!search) return true;
    const haystack = [
      row.Wo_Number,
      row.Wo_Description,
      row.Account_Name,
      row.Vendor_Name,
      row.Functional_Location,
      row.Functional_Location_Name,
      row.Accounting_Document,
      row.Document_Line_Description,
      row.Cost_Center_Name,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}

function renderKpis() {
  const m = metrics(state.filtered);
  const kpis = [
    ["Costo neto", money.format(m.net), "Suma de Amount_In_Usd"],
    ["Costo positivo", money.format(m.positive), "Debitos y cargos positivos"],
    ["Créditos / reversos", money.format(m.negative), "Valores negativos del periodo"],
    ["Registros", number.format(m.rows), "Líneas contables filtradas"],
    ["Con OT válida", percent.format(m.woPct), "Wo_Number distinto de 0"],
    ["Con proveedor", percent.format(m.vendorPct), "Vendor_Number informado"],
    ["Con ubicación técnica", percent.format(m.flocPct), "Functional_Location informado"],
    ["Costo sin OT válida", money.format(m.noWoCost), "Brecha de trazabilidad"],
  ];
  const grid = $("#kpiGrid");
  grid.innerHTML = "";
  for (const [label, value, note] of kpis) {
    grid.append(el("article", "kpi", `<span>${label}</span><strong>${value}</strong><small>${note}</small>`));
  }
}

function card(title, subtitle, body) {
  return `<article class="card"><div class="card-header"><div><h3>${title}</h3><p>${subtitle}</p></div></div>${body}</article>`;
}

function bars(data, formatter = money.format, maxItems = 12, mode = "positive") {
  const rows = data.slice(0, maxItems);
  const max = Math.max(...rows.map((d) => Math.abs(d.value)), 1);
  return `<div class="chart">${rows
    .map((d) => {
      const width = Math.max(1, (Math.abs(d.value) / max) * 100);
      const cls = d.value < 0 ? "bar-fill negative" : "bar-fill";
      return `<div class="bar-row">
        <div class="bar-label" title="${escapeHtml(d.label)}">${escapeHtml(d.label)}</div>
        <div class="bar-track"><div class="${cls}" style="width:${width}%"></div></div>
        <div class="bar-value">${formatter(d.value)}</div>
      </div>`;
    })
    .join("")}</div>`;
}

function lineChart(monthRows) {
  const months = ["001", "002", "003", "004", "005", "006", "007", "008", "009"];
  const values = months.map((month) => monthRows.get(month) || 0);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const width = 720;
  const height = 260;
  const pad = 36;
  const points = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / (months.length - 1);
    const y = height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
    return { x, y, value, month: months[index] };
  });
  const path = points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  const zeroY = height - pad - ((0 - min) / (max - min || 1)) * (height - pad * 2);
  return `<div class="chart"><svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución mensual">
    <line x1="${pad}" x2="${width - pad}" y1="${zeroY}" y2="${zeroY}" stroke="#d9e3e8" stroke-width="2" />
    <path d="${path}" fill="none" stroke="#14718a" stroke-width="4" stroke-linecap="round" />
    ${points
      .map(
        (p) => `<g>
          <circle cx="${p.x}" cy="${p.y}" r="5" fill="#0d4e63"></circle>
          <text x="${p.x}" y="${height - 10}" text-anchor="middle" font-size="12" fill="#60717a">P${p.month}</text>
          <title>P${p.month}: ${money.format(p.value)}</title>
        </g>`,
      )
      .join("")}
  </svg></div>`;
}

function table(columns, rows, limit = 80) {
  return `<div class="table-wrap"><table>
    <thead><tr>${columns.map((c) => `<th class="${c.num ? "num" : ""}">${c.label}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .slice(0, limit)
      .map(
        (row) =>
          `<tr>${columns
            .map((c) => `<td class="${c.num ? "num" : ""}">${c.render ? c.render(row) : escapeHtml(row[c.key] ?? "")}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody>
  </table></div>`;
}

function topTable(key, extra = {}) {
  const data = groupSum(state.filtered, key, extra).slice(0, 20);
  const total = sum(state.filtered) || 1;
  return table(
    [
      { label: "Elemento", key: "label" },
      { label: "Costo neto", num: true, render: (r) => money.format(r.value) },
      { label: "Participación", num: true, render: (r) => percent.format(r.value / total) },
    ],
    data,
    20,
  );
}

function renderExecutive() {
  const byMonth = new Map();
  for (const row of state.filtered) byMonth.set(row.Period_Number, (byMonth.get(row.Period_Number) || 0) + amount(row));
  const html = `
    <div class="grid-2">
      ${card("Evolución mensual", "Costo neto por periodo fiscal. Septiembre es parcial.", lineChart(byMonth))}
      ${card("Pareto por centro de costo", "Concentración de la ejecución financiera.", bars(groupSum(state.filtered, "Cost_Center_Name")))}
    </div>
    <div class="grid-3" style="margin-top:14px">
      ${card("Costo por área funcional", "Naturaleza financiera del gasto.", bars(groupSum(state.filtered, "Functional_Area_Name"), money.format, 10))}
      ${card("Costo por cuenta", "Cuentas contables con mayor peso.", bars(groupSum(state.filtered, "Account_Name"), money.format, 10))}
      ${card("Alertas de trazabilidad", "Cobertura de campos críticos.", qualityBadges())}
    </div>`;
  $("#pageExecutive").innerHTML = html;
}

function qualityBadges() {
  const m = metrics(state.filtered);
  return `<div class="chart">
    <p><span class="badge ${m.woPct >= 0.8 ? "good" : "warn"}">${percent.format(m.woPct)}</span> con OT válida</p>
    <p><span class="badge ${m.flocPct >= 0.8 ? "good" : "warn"}">${percent.format(m.flocPct)}</span> con ubicación técnica</p>
    <p><span class="badge ${m.vendorPct >= 0.6 ? "good" : "warn"}">${percent.format(m.vendorPct)}</span> con proveedor</p>
    <p><span class="badge warn">${money.format(m.noWoCost)}</span> costo sin OT válida</p>
    <p><span class="badge warn">${percent.format(m.top20Share)}</span> concentración Top 20 centro de costo</p>
  </div>`;
}

function renderStation() {
  const grouped = groupSum(state.filtered, "Cost_Center_Name");
  const rows = grouped.map((g) => {
    const subset = state.filtered.filter((r) => (r.Cost_Center_Name || "Sin dato") === g.label);
    return {
      label: g.label,
      value: g.value,
      rows: subset.length,
      wo: subset.length ? subset.filter((r) => r.wo_valid).length / subset.length : 0,
      vendor: subset.length ? subset.filter((r) => r.has_vendor).length / subset.length : 0,
    };
  });
  $("#pageStation").innerHTML = `
    <div class="grid-2">
      ${card("Ranking de centros de costo", "Costo neto por centro de costo.", bars(grouped, money.format, 15))}
      ${card("Profit center", "Distribución gerencial por profit center.", bars(groupSum(state.filtered, "Profit_Center_Name"), money.format, 15))}
    </div>
    <div style="margin-top:14px">${card(
      "Detalle por centro de costo",
      "Incluye cobertura de OT y proveedor.",
      table(
        [
          { label: "Centro de costo", key: "label" },
          { label: "Costo neto", num: true, render: (r) => money.format(r.value) },
          { label: "Registros", num: true, render: (r) => number.format(r.rows) },
          { label: "% OT válida", num: true, render: (r) => percent.format(r.wo) },
          { label: "% proveedor", num: true, render: (r) => percent.format(r.vendor) },
        ],
        rows,
        80,
      ),
    )}</div>`;
}

function renderAccount() {
  $("#pageAccount").innerHTML = `
    <div class="grid-2">
      ${card("Área funcional", "Clasificación financiera principal.", bars(groupSum(state.filtered, "Functional_Area_Name"), money.format, 14))}
      ${card("Cuenta contable", "Pareto de cuentas.", bars(groupSum(state.filtered, "Account_Name"), money.format, 14))}
    </div>
    <div class="grid-2" style="margin-top:14px">
      ${card("Nivel financiero", "Vista por Level 3.", topTable("Level 3 (Summ FS)"))}
      ${card("Departamento / actividad", "Clasificación auxiliar cuando existe.", topTable("Department", { includeBlank: true }))}
    </div>`;
}

function renderOrders() {
  const validRows = state.filtered.filter((r) => r.wo_valid);
  const invalidCost = sum(state.filtered.filter((r) => !r.wo_valid));
  $("#pageOrders").innerHTML = `
    <div class="grid-3">
      ${card("Top 20 OT válidas", "Wo_Number = 0 está excluido.", topTable("Wo_Number", { validOnly: true }))}
      ${card("Tipo de OT", "Solo filas con tipo informado.", bars(groupSum(validRows, "Wo_Type"), money.format, 12))}
      ${card("Actividad de OT", "Preventivo, correctivo, predictivo u otros.", bars(groupSum(validRows, "Wo_Activity_Type"), money.format, 12))}
    </div>
    <div class="grid-2" style="margin-top:14px">
      ${card("Costo sin OT válida", "Debe tratarse como brecha de trazabilidad.", `<div class="chart"><div class="kpi"><span>Costo sin OT válida</span><strong>${money.format(invalidCost)}</strong><small>No incluir en ranking de OT</small></div></div>`)}
      ${card("Detalle OT", "Primeras 80 OT por costo neto.", orderDetail(validRows))}
    </div>`;
}

function orderDetail(rows) {
  const grouped = groupSum(rows, "Wo_Number", { validOnly: true }).slice(0, 80);
  const details = grouped.map((g) => {
    const first = rows.find((r) => r.Wo_Number === g.label) || {};
    return { ...g, desc: first.Wo_Description, type: first.Wo_Type, activity: first.Wo_Activity_Type, floc: first.Functional_Location };
  });
  return table(
    [
      { label: "OT", key: "label" },
      { label: "Descripción", key: "desc" },
      { label: "Tipo", key: "type" },
      { label: "Actividad", key: "activity" },
      { label: "Ubicación", key: "floc" },
      { label: "Costo neto", num: true, render: (r) => money.format(r.value) },
    ],
    details,
    80,
  );
}

function renderTechnical() {
  const withFloc = state.filtered.filter((r) => r.has_floc);
  $("#pageTechnical").innerHTML = `
    <div class="grid-2">
      ${card("Top ubicaciones técnicas", "Costo neto solo donde existe Functional_Location.", topTable("Functional_Location"))}
      ${card("Sistemas", "Cobertura limitada; requiere IH01 para tablero técnico completo.", bars(groupSum(withFloc, "Floc_System_Level4", { includeBlank: true }), money.format, 14))}
    </div>
    <div class="grid-2" style="margin-top:14px">
      ${card("Segmentos / subsistemas", "Campo auxiliar con baja cobertura.", bars(groupSum(withFloc, "Floc_Segment_Level3", { includeBlank: true }), money.format, 14))}
      ${card("Activos", "Asset no equivale a equipo SAP individual.", topTable("Asset", { includeBlank: true }))}
    </div>`;
}

function renderVendors() {
  const withVendor = state.filtered.filter((r) => r.has_vendor);
  $("#pageVendors").innerHTML = `
    <div class="grid-2">
      ${card("Top proveedores", "Solo registros con Vendor_Number informado.", bars(groupSum(withVendor, "Vendor_Name"), money.format, 15))}
      ${card("Pedidos y SES", "Trazabilidad de compras y servicios cuando existe.", vendorPoTable(withVendor))}
    </div>
    <div style="margin-top:14px">${card(
      "Facturas y documentos",
      "Primeras líneas con proveedor informado.",
      table(
        [
          { label: "Proveedor", key: "Vendor_Name" },
          { label: "PO", key: "Po_Number" },
          { label: "SES", key: "Ses_Number" },
          { label: "Factura", key: "Invoice_Number" },
          { label: "Documento", key: "Accounting_Document" },
          { label: "Costo", num: true, render: (r) => money.format(amount(r)) },
        ],
        withVendor.sort((a, b) => amount(b) - amount(a)),
        120,
      ),
    )}</div>`;
}

function vendorPoTable(rows) {
  const grouped = groupSum(rows, "Po_Number").slice(0, 25);
  return table(
    [
      { label: "PO", key: "label" },
      { label: "Costo neto", num: true, render: (r) => money.format(r.value) },
    ],
    grouped,
    25,
  );
}

function renderQuality() {
  const quality = state.meta.quality.map((q) => ({
    ...q,
    missingPct: state.meta.rows ? q.missing / state.meta.rows : 0,
  }));
  const rows = state.filtered;
  const zeroRows = rows.filter((r) => amount(r) === 0).length;
  const negativeRows = rows.filter((r) => amount(r) < 0).length;
  $("#pageQuality").innerHTML = `
    <div class="grid-3">
      ${card("Completitud por campo", "Cobertura calculada sobre el dataset del Site.", bars(quality.map((q) => ({ label: q.field, value: q.coverage })), (v) => percent.format(v), 12))}
      ${card("Riesgos de interpretación", "Campos críticos para análisis técnico.", table(
        [
          { label: "Campo", key: "field" },
          { label: "Cobertura", num: true, render: (r) => percent.format(r.coverage) },
          { label: "Faltantes", num: true, render: (r) => number.format(r.missing) },
        ],
        quality,
        20,
      ))}
      ${card("Forma de los datos filtrados", "Reversos, ceros y corte temporal.", `<div class="chart">
        <p><span class="badge warn">${number.format(negativeRows)}</span> registros negativos</p>
        <p><span class="badge warn">${number.format(zeroRows)}</span> registros en cero</p>
        <p><span class="badge">Posting ${state.meta.posting_min} a ${state.meta.posting_max}</span></p>
        <p><span class="badge warn">Periodo ${state.meta.partial_period}</span> parcial</p>
        <p><span class="badge">ETL máx. ${state.meta.etl_max}</span></p>
      </div>`)}
    </div>
    <div style="margin-top:14px">${card("Registros de la vista", "Muestra filtrada para auditoría rápida.", detailRows(rows))}</div>`;
}

function detailRows(rows) {
  return table(
    [
      { label: "Periodo", key: "Period_Number" },
      { label: "Documento", key: "Accounting_Document" },
      { label: "Línea", key: "Accounting_Document_Line" },
      { label: "Centro costo", key: "Cost_Center_Name" },
      { label: "Cuenta", key: "Account_Name" },
      { label: "OT", render: (r) => (r.wo_valid ? escapeHtml(r.Wo_Number) : '<span class="badge warn">Sin OT</span>') },
      { label: "Proveedor", key: "Vendor_Name" },
      { label: "Costo", num: true, render: (r) => money.format(amount(r)) },
    ],
    rows.slice().sort((a, b) => Math.abs(amount(b)) - Math.abs(amount(a))),
    150,
  );
}

function renderPage() {
  renderKpis();
  renderExecutive();
  renderStation();
  renderAccount();
  renderOrders();
  renderTechnical();
  renderVendors();
  renderQuality();
}

function setPage(page) {
  state.page = page;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.page === page));
  document.querySelectorAll(".page").forEach((pageNode) => pageNode.classList.remove("active"));
  const map = {
    executive: "#pageExecutive",
    station: "#pageStation",
    account: "#pageAccount",
    orders: "#pageOrders",
    technical: "#pageTechnical",
    vendors: "#pageVendors",
    quality: "#pageQuality",
  };
  $(map[page]).classList.add("active");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadCsv() {
  const columns = [
    "Fiscal_Year",
    "Period_Number",
    "Posting_Date",
    "Accounting_Document",
    "Accounting_Document_Line",
    "Cost_Center",
    "Cost_Center_Name",
    "Account_Number",
    "Account_Name",
    "Functional_Area_Name",
    "Amount_In_Usd",
    "Wo_Number",
    "Wo_Type",
    "Wo_Activity_Type",
    "Functional_Location",
    "Vendor_Number",
    "Vendor_Name",
  ];
  const lines = [columns.join(",")];
  for (const row of state.filtered) {
    lines.push(columns.map((col) => `"${String(row[col] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "costos_mantenimiento_filtrado.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  $("#scopeFilter").addEventListener("change", (event) => {
    state.filters.scope = event.target.value;
    populateFilters();
    applyFilters();
    renderPage();
  });

  for (const [key, id] of Object.entries(ids)) {
    if (key === "scope") continue;
    const node = $(id);
    node.addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      applyFilters();
      renderPage();
    });
  }

  $("#searchBox").addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    applyFilters();
    renderPage();
  });

  $("#resetFilters").addEventListener("click", () => {
    for (const key of Object.keys(state.filters)) state.filters[key] = key === "scope" ? "strict" : "";
    $("#scopeFilter").value = "strict";
    $("#searchBox").value = "";
    populateFilters();
    for (const [key, id] of Object.entries(ids)) $(id).value = state.filters[key] || "";
    applyFilters();
    renderPage();
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setPage(tab.dataset.page));
  });

  $("#downloadCsv").addEventListener("click", downloadCsv);

  $("#odsFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const status = $("#fileStatus");
    status.textContent = "Leyendo hoja Data...";
    status.className = "file-status loading-text";
    try {
      const payload = await loadUploadedFile(file);
      state.rows = payload.rows;
      state.meta = payload.meta;
      for (const key of Object.keys(state.filters)) state.filters[key] = key === "scope" ? "strict" : "";
      $("#scopeFilter").value = "strict";
      $("#searchBox").value = "";
      $("#sourceLine").textContent = `${state.meta.source} · hoja Data · ${number.format(state.meta.rows)} líneas preparadas · posting ${state.meta.posting_min} a ${state.meta.posting_max}`;
      populateFilters();
      applyFilters();
      renderPage();
      status.textContent = `Archivo cargado: ${file.name} (${number.format(state.rows.length)} líneas de mantenimiento).`;
      status.className = "file-status success-text";
    } catch (error) {
      console.error(error);
      status.textContent = error.message || "No se pudo cargar el archivo.";
      status.className = "file-status error-text";
    }
  });
}

async function init() {
  bindEvents();
  try {
    const payload = await loadCompressedData();
    state.rows = payload.rows;
    state.meta = payload.meta;
    $("#sourceLine").textContent = `${state.meta.source} · hoja ${state.meta.source_sheet} · ${number.format(state.meta.rows)} líneas preparadas · posting ${state.meta.posting_min} a ${state.meta.posting_max}`;
    populateFilters();
    applyFilters();
    renderPage();
    setPage("executive");
    $("#loading").classList.add("hidden");
  } catch (error) {
    console.error(error);
    $("#loading").textContent = "Seleccione un archivo XLSX para iniciar el dashboard.";
    $("#fileStatus").textContent = "No se pudo cargar el snapshot. Puedes cargar el archivo ODS SAP desde aquí.";
    $("#fileStatus").className = "file-status error-text";
  }
}

async function loadCompressedData() {
  try {
    if ("DecompressionStream" in window) {
      const compressed = window.DASHBOARD_DATA_GZ_BASE64
        ? base64ToArrayBuffer(window.DASHBOARD_DATA_GZ_BASE64)
        : await fetch("./data/dashboard-data.json.gz").then((response) => response.arrayBuffer());
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text());
    }
  } catch (error) {
    console.warn("No se pudo leer el snapshot comprimido; se intenta el respaldo JSON.", error);
  }
  const response = await fetch("./data/dashboard-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar el respaldo de datos (${response.status}).`);
  return response.json();
}

async function loadUploadedFile(file) {
  if (!window.XLSX) throw new Error("No se pudo cargar el lector XLSX. Verifique la conexión y vuelva a intentar.");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  if (!workbook.SheetNames.includes("Data")) throw new Error("El archivo no contiene una hoja llamada Data.");
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets.Data, { defval: "", raw: true });
  if (!rawRows.length) throw new Error("La hoja Data no contiene registros.");
  const rows = normalizeUploadedRows(rawRows);
  if (!rows.length) throw new Error("No se encontraron registros de mantenimiento en la hoja Data.");
  return { rows, meta: buildUploadedMeta(rows, file.name) };
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

init().catch((error) => {
  console.error(error);
  $("#loading").textContent = "No se pudo cargar el dashboard.";
});
