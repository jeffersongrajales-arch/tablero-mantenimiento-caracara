const fmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

let source;

const state = {
  mode: 'monthly',
  station: 'total',
  from: '',
  to: '',
};

const stationNames = {
  total: 'Total Jaguar + CCS',
  jaguar: 'Jaguar',
  ccs: 'Caracara Sur',
};

const byId = (id) => document.getElementById(id);

function num(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return Number(row[key] || 0);
  }
  return 0;
}

function monthInRange(month) {
  return (!state.from || month >= state.from) && (!state.to || month <= state.to);
}

function dailyInRange(day) {
  const month = day.slice(0, 7);
  return monthInRange(month);
}

function filteredMonthly() {
  return source.monthly.filter((row) => monthInRange(row.month));
}

function filteredDaily() {
  return source.daily.filter((row) => dailyInRange(row.day));
}

function activeRecords() {
  return state.mode === 'monthly' ? filteredMonthly() : filteredDaily();
}

function getLabel(row) {
  return row.month || row.day || '';
}

function getEnergy(row) {
  return num(row, ['energy_kwh', 'energy_kwh_imported_jaguar_ccs']);
}

function getTotalFluids(row) {
  return num(row, ['fluids_bbl', 'total_fluids_bbl']);
}

function getCcsFluids(row) {
  return num(row, ['fluids_ccs_bbl', 'total_fluids_ccs_bbl']);
}

function getJaguarFluids(row) {
  return num(row, ['fluids_jaguar_bbl', 'total_fluids_jaguar_bbl']);
}

function getSelectedFluids(row) {
  if (state.station === 'ccs') return getCcsFluids(row);
  if (state.station === 'jaguar') return getJaguarFluids(row);
  return getTotalFluids(row);
}

function getSystemIndex(row) {
  return num(row, ['index_kwh_per_bbl', 'energy_index_kwh_per_bbl', 'avg_index']);
}

function weightedIndex(records) {
  const energy = records.reduce((acc, row) => acc + getEnergy(row), 0);
  const fluids = records.reduce((acc, row) => acc + getTotalFluids(row), 0);
  return fluids ? energy / fluids : 0;
}

function formatEnergy(value) {
  if (value >= 1000000) return `${fmt1.format(value / 1000000)} GWh`;
  return `${fmt.format(value)} kWh`;
}

function formatBbl(value) {
  if (value >= 1000000) return `${fmt1.format(value / 1000000)} MMbbl`;
  return `${fmt.format(value)} bbl`;
}

function stationTotals(records) {
  const ccs = records.reduce((acc, row) => acc + getCcsFluids(row), 0);
  const jaguar = records.reduce((acc, row) => acc + getJaguarFluids(row), 0);
  const total = ccs + jaguar;
  return {
    ccs,
    jaguar,
    total,
    ccsShare: total ? ccs / total : 0,
    jaguarShare: total ? jaguar / total : 0,
  };
}

function selectedStationLabel() {
  return stationNames[state.station] || stationNames.total;
}

function setFilters() {
  const months = source.monthly.map((row) => row.month);
  state.from = months[0];
  state.to = months[months.length - 1];
  byId('fromMonth').min = state.from;
  byId('fromMonth').max = state.to;
  byId('toMonth').min = state.from;
  byId('toMonth').max = state.to;
  byId('fromMonth').value = state.from;
  byId('toMonth').value = state.to;
}

function updateStationButtons() {
  document.querySelectorAll('.station-button').forEach((button) => {
    const active = button.dataset.station === state.station;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function renderKpis() {
  const daily = filteredDaily();
  const monthly = filteredMonthly();
  const energy = daily.reduce((acc, row) => acc + getEnergy(row), 0);
  const totalFluids = daily.reduce((acc, row) => acc + getTotalFluids(row), 0);
  const selectedFluids = daily.reduce((acc, row) => acc + getSelectedFluids(row), 0);
  const systemIndex = totalFluids ? energy / totalFluids : 0;
  const latest = monthly[monthly.length - 1] || source.highlights.latest_month;
  const baseline = source.totals.baseline_p25_kwh_per_bbl;
  const saving = Math.max(0, (Number(latest.index_kwh_per_bbl || latest.avg_index || 0) - baseline) * Number(latest.fluids_bbl || 0));
  const station = stationTotals(daily);
  const p75 = source.totals.p75_kwh_per_bbl;
  const p75Days = daily.filter((row) => getSystemIndex(row) > p75).length;
  const dominant = station.ccs >= station.jaguar ? 'CCS' : 'Jaguar';

  byId('kpiIndex').textContent = fmt1.format(systemIndex);
  byId('kpiEnergy').textContent = formatEnergy(energy);
  byId('kpiFluids').textContent = formatBbl(selectedFluids);
  byId('kpiSavings').textContent = formatEnergy(saving);
  byId('kpiCcsFluids').textContent = formatBbl(station.ccs);
  byId('kpiJaguarFluids').textContent = formatBbl(station.jaguar);
  byId('kpiCcsShare').textContent = `${fmtPct.format(station.ccsShare * 100)}% del volumen total`;
  byId('kpiJaguarShare').textContent = `${fmtPct.format(station.jaguarShare * 100)}% del volumen total`;
  byId('kpiDominantStation').textContent = dominant;
  byId('kpiP75Days').textContent = fmt.format(p75Days);
  byId('kpiIndexNote').textContent = state.station === 'total' ? 'Indice real consolidado' : 'Indice real del sistema total';
  byId('kpiEnergyNote').textContent = 'Energia total importada de red';
  byId('kpiFluidsNote').textContent = `Fluidos filtrados: ${selectedStationLabel()}`;
  byId('periodLabel').textContent = `${source.period.start} a ${source.period.end} · ${source.period.days} dias fuente`;
}

function chartScales(values, width, height, padding) {
  const clean = values.filter((value) => Number.isFinite(value));
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  return {
    x: (i, count) => padding.left + (count <= 1 ? 0 : i * (width - padding.left - padding.right) / (count - 1)),
    y: (v) => padding.top + (max - v) * (height - padding.top - padding.bottom) / span,
    min,
    max,
  };
}

function lineChart(container, records, labelKey, valueKey, secondaryKey) {
  const el = byId(container);
  if (!records.length) {
    el.innerHTML = '<p>No hay datos para el periodo seleccionado.</p>';
    return;
  }
  const width = 760;
  const height = 310;
  const padding = { top: 18, right: 24, bottom: 44, left: 52 };
  const values = records.flatMap((row) => [Number(row[valueKey] || 0), secondaryKey ? Number(row[secondaryKey] || 0) : Number(row[valueKey] || 0)]).filter(Boolean);
  const scale = chartScales(values, width, height, padding);
  const path = records.map((row, i) => `${i ? 'L' : 'M'}${scale.x(i, records.length).toFixed(1)},${scale.y(Number(row[valueKey] || 0)).toFixed(1)}`).join(' ');
  const secondaryPath = secondaryKey ? records.map((row, i) => `${i ? 'L' : 'M'}${scale.x(i, records.length).toFixed(1)},${scale.y(Number(row[secondaryKey] || 0)).toFixed(1)}`).join(' ') : '';
  const ticks = [scale.min, scale.min + (scale.max - scale.min) / 2, scale.max];
  const labels = records.length > 9 ? records.filter((_, i) => i === 0 || i === records.length - 1 || i === Math.floor(records.length / 2)) : records;
  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      ${ticks.map((tick) => `<line class="grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${scale.y(tick)}" y2="${scale.y(tick)}"></line>`).join('')}
      ${ticks.map((tick) => `<text x="8" y="${scale.y(tick) + 4}" class="axis">${fmt1.format(tick)}</text>`).join('')}
      <path class="line-index" d="${path}"></path>
      ${secondaryPath ? `<path class="line-secondary" d="${secondaryPath}"></path>` : ''}
      ${labels.map((row) => {
        const i = records.indexOf(row);
        return `<text x="${scale.x(i, records.length)}" y="${height - 12}" text-anchor="${i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle'}" class="axis">${row[labelKey]}</text>`;
      }).join('')}
    </svg>`;
}

function normalizedBarChart(container, records) {
  const el = byId(container);
  if (!records.length) {
    el.innerHTML = '<p>No hay datos para el periodo seleccionado.</p>';
    return;
  }
  const width = 760;
  const height = 330;
  const padding = { top: 28, right: 22, bottom: 52, left: 52 };
  const firstEnergy = getEnergy(records[0]) || 1;
  const firstFluids = getSelectedFluids(records[0]) || 1;
  const energyVals = records.map((row) => (getEnergy(row) / firstEnergy) * 100);
  const fluidVals = records.map((row) => (getSelectedFluids(row) / firstFluids) * 100);
  const max = Math.max(...energyVals, ...fluidVals, 100) || 100;
  const min = Math.min(...energyVals, ...fluidVals, 100) || 0;
  const span = max - min || 1;
  const barArea = width - padding.left - padding.right;
  const group = barArea / records.length;
  const bar = Math.max(5, Math.min(18, group / 3));
  const y = (v) => padding.top + (max - v) * (height - padding.top - padding.bottom) / span;
  const labels = records.length > 9 ? records.filter((_, i) => i === 0 || i === records.length - 1 || i === Math.floor(records.length / 2)) : records;
  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <text x="${padding.left}" y="16" class="chart-title">E = energia importada · F = fluidos ${selectedStationLabel()}</text>
      ${[min, 100, max].map((tick) => `<line class="grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${y(tick)}" y2="${y(tick)}"></line>`).join('')}
      ${[min, 100, max].map((tick) => `<text x="8" y="${y(tick) + 4}" class="axis">${fmt.format(tick)}</text>`).join('')}
      ${records.map((row, i) => {
        const x = padding.left + i * group + group / 2;
        const e = energyVals[i];
        const f = fluidVals[i];
        return `<rect class="bar-energy" x="${x - bar - 2}" y="${y(e)}" width="${bar}" height="${height - padding.bottom - y(e)}"></rect>
          <rect class="bar-fluid" x="${x + 2}" y="${y(f)}" width="${bar}" height="${height - padding.bottom - y(f)}"></rect>
          ${records.length <= 14 ? `<text x="${x - bar / 2 - 2}" y="${height - 34}" text-anchor="middle" class="bar-tag">E</text><text x="${x + bar / 2 + 2}" y="${height - 34}" text-anchor="middle" class="bar-tag">F</text>` : ''}`;
      }).join('')}
      ${labels.map((row) => {
        const i = records.indexOf(row);
        return `<text x="${padding.left + i * group + group / 2}" y="${height - 12}" text-anchor="${i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle'}" class="axis">${getLabel(row)}</text>`;
      }).join('')}
    </svg>`;
}

function stationFluidChart(container, records) {
  const el = byId(container);
  if (!records.length) {
    el.innerHTML = '<p>No hay datos para el periodo seleccionado.</p>';
    return;
  }
  const width = 760;
  const height = 330;
  const padding = { top: 28, right: 22, bottom: 52, left: 52 };
  const ccsVals = records.map((row) => getCcsFluids(row) / 1000);
  const jaguarVals = records.map((row) => getJaguarFluids(row) / 1000);
  const max = Math.max(...ccsVals, ...jaguarVals) || 1;
  const barArea = width - padding.left - padding.right;
  const group = barArea / records.length;
  const bar = Math.max(5, Math.min(18, group / 3));
  const y = (v) => padding.top + (max - v) * (height - padding.top - padding.bottom) / max;
  const labels = records.length > 9 ? records.filter((_, i) => i === 0 || i === records.length - 1 || i === Math.floor(records.length / 2)) : records;
  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <text x="${padding.left}" y="16" class="chart-title">CS = Caracara Sur · J = Jaguar</text>
      ${[0, max / 2, max].map((tick) => `<line class="grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${y(tick)}" y2="${y(tick)}"></line>`).join('')}
      ${[0, max / 2, max].map((tick) => `<text x="8" y="${y(tick) + 4}" class="axis">${fmt.format(tick)}k</text>`).join('')}
      ${records.map((row, i) => {
        const x = padding.left + i * group + group / 2;
        const c = ccsVals[i];
        const j = jaguarVals[i];
        return `<rect class="bar-ccs" x="${x - bar - 2}" y="${y(c)}" width="${bar}" height="${height - padding.bottom - y(c)}"></rect>
          <rect class="bar-jaguar" x="${x + 2}" y="${y(j)}" width="${bar}" height="${height - padding.bottom - y(j)}"></rect>
          ${records.length <= 14 ? `<text x="${x - bar / 2 - 2}" y="${height - 34}" text-anchor="middle" class="bar-tag">CS</text><text x="${x + bar / 2 + 2}" y="${height - 34}" text-anchor="middle" class="bar-tag">J</text>` : ''}`;
      }).join('')}
      ${labels.map((row) => {
        const i = records.indexOf(row);
        return `<text x="${padding.left + i * group + group / 2}" y="${height - 12}" text-anchor="${i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle'}" class="axis">${getLabel(row)}</text>`;
      }).join('')}
    </svg>`;
}

function renderStationSummary() {
  const records = activeRecords();
  const station = stationTotals(records);
  const systemIndex = weightedIndex(records);
  const dominant = station.ccs >= station.jaguar ? 'CCS' : 'Jaguar';
  const selectedFluids = records.reduce((acc, row) => acc + getSelectedFluids(row), 0);
  const selectedShare = station.total ? selectedFluids / station.total : 0;
  byId('stationSummary').innerHTML = `
    <div class="summary-row"><span>Vista activa</span><strong>${selectedStationLabel()}</strong></div>
    <div class="summary-row"><span>Indice real del sistema</span><strong>${fmt1.format(systemIndex)} kWh/bbl</strong></div>
    <div class="summary-row"><span>Fluidos vista activa</span><strong>${formatBbl(selectedFluids)}</strong></div>
    <div class="summary-row"><span>Participacion vista activa</span><strong>${fmtPct.format(selectedShare * 100)}%</strong></div>
    <div class="summary-note">La estacion dominante en volumen total es <strong>${dominant}</strong>. La seleccion de estacion cambia fluidos, participacion, graficas y tablas.</div>
    <div class="summary-note warn-note">La energia aun es consolidada Jaguar + CCS; para eficiencia real individual se requieren medidores separados por estacion.</div>
  `;
}

function renderFindings() {
  const totals = source.totals;
  const latest = source.highlights.latest_month;
  const best = source.highlights.best_month;
  const worst = source.highlights.worst_month;
  const change = source.highlights.period_change_pct_first_to_latest;
  const corr = source.highlights.correlation_energy_vs_fluids;
  const direction = change > 0 ? 'aumento' : 'reduccion';
  const label = selectedStationLabel();
  byId('executiveFindings').innerHTML = [
    `Vista activa: <strong>${label}</strong>. El indice ponderado real del sistema es <strong>${fmt1.format(totals.weighted_index_kwh_per_bbl)} kWh/bbl</strong>.`,
    `El mejor mes del sistema fue <strong>${best.month}</strong> con ${fmt1.format(best.index_kwh_per_bbl)} kWh/bbl; el peor fue <strong>${worst.month}</strong> con ${fmt1.format(worst.index_kwh_per_bbl)} kWh/bbl.`,
    `Entre el primer mes y ${latest.month} se observa un ${direction} de <strong>${fmtPct.format(Math.abs(change))}%</strong> en el indice mensual.`,
    `La correlacion energia-fluidos es <strong>${fmt1.format(corr)}</strong>; la energia no sube de forma perfectamente proporcional al volumen.`
  ].map((item) => `<li>${item}</li>`).join('');

  byId('opportunities').innerHTML = [
    `Revisar dias por encima del percentil 75 (${fmt1.format(totals.p75_kwh_per_bbl)} kWh/bbl): validar bombas en servicio, recirculaciones, restricciones de proceso y equipos auxiliares.`,
    `Usar el percentil 25 (${fmt1.format(totals.baseline_p25_kwh_per_bbl)} kWh/bbl) como referencia interna inicial, no como meta contractual.`,
    `Cruzar picos del indice con paradas, mantenimiento de bombas, cambios de pozo, presion de inyeccion y bitacora operacional.`,
    `Mantener Toro Sentado separado por su generacion local.`
  ].map((item) => `<li>${item}</li>`).join('');
}

function renderTables() {
  const months = filteredMonthly().slice().reverse();
  byId('monthlyTable').innerHTML = months.map((row) => `
    <tr>
      <td>${row.month}</td>
      <td>${fmt1.format(getSystemIndex(row))}</td>
      <td>${formatEnergy(getEnergy(row))}</td>
      <td>${formatBbl(getSelectedFluids(row))}</td>
      <td>${row.delta_vs_prev_pct == null || row.delta_vs_prev_pct === '' ? '-' : `${fmtPct.format(row.delta_vs_prev_pct)}%`}</td>
    </tr>
  `).join('');

  const p75 = source.totals.p75_kwh_per_bbl;
  const critical = source.high_index_days.filter((row) => dailyInRange(row.day)).slice(0, 10);
  byId('criticalDays').innerHTML = critical.map((row) => {
    const high = getSystemIndex(row) > p75;
    return `
      <tr>
        <td>${row.day}</td>
        <td>${fmt1.format(getSystemIndex(row))}</td>
        <td>${formatEnergy(getEnergy(row))}</td>
        <td>${formatBbl(getSelectedFluids(row))}</td>
        <td><span class="alert-chip ${high ? 'bad' : 'warn'}">${high ? 'P75' : 'Revisar'}</span></td>
      </tr>
    `;
  }).join('');

  byId('stationTable').innerHTML = months.map((row) => {
    const ccs = getCcsFluids(row);
    const jaguar = getJaguarFluids(row);
    const total = ccs + jaguar;
    const ccsShare = total ? ccs / total : 0;
    const jaguarShare = total ? jaguar / total : 0;
    const leader = ccs >= jaguar ? 'CCS aporta mayor volumen' : 'Jaguar aporta mayor volumen';
    return `
      <tr>
        <td>${row.month}</td>
        <td>${fmt1.format(getSystemIndex(row))}</td>
        <td>${formatBbl(ccs)}</td>
        <td>${fmtPct.format(ccsShare * 100)}%</td>
        <td>${formatBbl(jaguar)}</td>
        <td>${fmtPct.format(jaguarShare * 100)}%</td>
        <td>${leader}</td>
      </tr>
    `;
  }).join('');
}

function renderTrendSignal(records) {
  const el = byId('trendSignal');
  const last = records[records.length - 1];
  const prev = records[records.length - 2];
  if (!last || !prev) {
    el.textContent = 'Sin comparativo';
    el.className = 'signal';
    return;
  }
  const delta = ((getSystemIndex(last) / getSystemIndex(prev)) - 1) * 100;
  el.textContent = `${delta >= 0 ? '+' : ''}${fmtPct.format(delta)}% vs anterior`;
  el.className = `signal ${delta > 2 ? 'bad' : delta < -2 ? 'good' : 'warn'}`;
}

function renderCharts() {
  const records = activeRecords();
  const labelKey = state.mode === 'monthly' ? 'month' : 'day';
  if (state.mode === 'monthly') {
    lineChart('indexChart', records, labelKey, 'index_kwh_per_bbl');
  } else {
    lineChart('indexChart', records, labelKey, 'energy_index_kwh_per_bbl', 'rolling_7d_index');
  }
  normalizedBarChart('energyFluidChart', records);
  stationFluidChart('stationFluidChart', records);
  renderTrendSignal(records);
  byId('indexChartNote').textContent = state.station === 'total'
    ? 'Menor valor indica mejor eficiencia energetica del sistema.'
    : `Indice del sistema total; fluidos filtrados para ${selectedStationLabel()}.`;
  byId('energyFluidNote').textContent = `Base 100. Izquierda energia total importada; derecha fluidos de ${selectedStationLabel()}.`;
}

function render() {
  updateStationButtons();
  renderKpis();
  renderCharts();
  renderStationSummary();
  renderFindings();
  renderTables();
}

async function init() {
  const response = await fetch('./data.json?v=20260915-fix4', { cache: 'no-store' });
  source = await response.json();
  setFilters();
  render();

  byId('viewMode').addEventListener('change', (event) => {
    state.mode = event.target.value;
    render();
  });

  document.querySelectorAll('.station-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.station = button.dataset.station || 'total';
      render();
    });
  });

  byId('fromMonth').addEventListener('change', (event) => {
    state.from = event.target.value;
    if (state.to < state.from) {
      state.to = state.from;
      byId('toMonth').value = state.to;
    }
    render();
  });

  byId('toMonth').addEventListener('change', (event) => {
    state.to = event.target.value;
    if (state.from > state.to) {
      state.from = state.to;
      byId('fromMonth').value = state.from;
    }
    render();
  });

  byId('resetFilters').addEventListener('click', () => {
    setFilters();
    state.mode = 'monthly';
    state.station = 'total';
    byId('viewMode').value = 'monthly';
    render();
  });
}

init().catch((error) => {
  document.body.innerHTML = `<main class="panel"><h1>No se pudo cargar el dashboard</h1><p>${error.message}</p></main>`;
});
