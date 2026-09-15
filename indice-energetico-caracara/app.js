const fmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

let source;

const state = {
  mode: 'monthly',
  from: '',
  to: '',
};

const byId = (id) => document.getElementById(id);

function monthInRange(month) {
  return (!state.from || month >= state.from) && (!state.to || month <= state.to);
}

function dailyInRange(day) {
  const month = day.slice(0, 7);
  return monthInRange(month);
}

function sum(records, key) {
  return records.reduce((acc, row) => acc + Number(row[key] || 0), 0);
}

function weightedIndex(records) {
  const energy = sum(records, state.mode === 'monthly' ? 'energy_kwh' : 'energy_kwh_imported_jaguar_ccs');
  const fluids = sum(records, state.mode === 'monthly' ? 'fluids_bbl' : 'total_fluids_bbl');
  return fluids ? energy / fluids : 0;
}

function filteredMonthly() {
  return source.monthly.filter((row) => monthInRange(row.month));
}

function filteredDaily() {
  return source.daily.filter((row) => dailyInRange(row.day));
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

function formatEnergy(value) {
  if (value >= 1000000) return `${fmt1.format(value / 1000000)} GWh`;
  return `${fmt.format(value)} kWh`;
}

function formatBbl(value) {
  if (value >= 1000000) return `${fmt1.format(value / 1000000)} MMbbl`;
  return `${fmt.format(value)} bbl`;
}

function renderKpis() {
  const daily = filteredDaily();
  const monthly = filteredMonthly();
  const energy = sum(daily, 'energy_kwh_imported_jaguar_ccs');
  const fluids = sum(daily, 'total_fluids_bbl');
  const index = fluids ? energy / fluids : 0;
  const latest = monthly[monthly.length - 1] || source.highlights.latest_month;
  const baseline = source.totals.baseline_p25_kwh_per_bbl;
  const saving = Math.max(0, (Number(latest.index_kwh_per_bbl || latest.avg_index || 0) - baseline) * Number(latest.fluids_bbl || 0));

  byId('kpiIndex').textContent = fmt1.format(index);
  byId('kpiEnergy').textContent = formatEnergy(energy);
  byId('kpiFluids').textContent = formatBbl(fluids);
  byId('kpiSavings').textContent = formatEnergy(saving);
  byId('periodLabel').textContent = `${source.period.start} a ${source.period.end} · ${source.period.days} dias fuente`;
}

function chartScales(values, width, height, padding) {
  const min = Math.min(...values);
  const max = Math.max(...values);
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

function barChart(container, records) {
  const el = byId(container);
  if (!records.length) {
    el.innerHTML = '<p>No hay datos para el periodo seleccionado.</p>';
    return;
  }
  const width = 760;
  const height = 310;
  const padding = { top: 18, right: 22, bottom: 44, left: 52 };
  const energyVals = records.map((row) => Number(row.energy_kwh || row.energy_kwh_imported_jaguar_ccs || 0) / 1000);
  const fluidVals = records.map((row) => Number(row.fluids_bbl || row.total_fluids_bbl || 0) / 1000);
  const max = Math.max(...energyVals, ...fluidVals) || 1;
  const barArea = width - padding.left - padding.right;
  const group = barArea / records.length;
  const bar = Math.max(3, Math.min(18, group / 3));
  const y = (v) => padding.top + (max - v) * (height - padding.top - padding.bottom) / max;
  const labels = records.length > 9 ? records.filter((_, i) => i === 0 || i === records.length - 1 || i === Math.floor(records.length / 2)) : records;
  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      ${[0, max / 2, max].map((tick) => `<line class="grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${y(tick)}" y2="${y(tick)}"></line>`).join('')}
      ${[0, max / 2, max].map((tick) => `<text x="8" y="${y(tick) + 4}" class="axis">${fmt.format(tick)}k</text>`).join('')}
      ${records.map((row, i) => {
        const x = padding.left + i * group + group / 2;
        const e = energyVals[i];
        const f = fluidVals[i];
        return `<rect class="bar-energy" x="${x - bar - 1}" y="${y(e)}" width="${bar}" height="${height - padding.bottom - y(e)}"></rect>
          <rect class="bar-fluid" x="${x + 1}" y="${y(f)}" width="${bar}" height="${height - padding.bottom - y(f)}"></rect>`;
      }).join('')}
      ${labels.map((row) => {
        const i = records.indexOf(row);
        return `<text x="${padding.left + i * group + group / 2}" y="${height - 12}" text-anchor="${i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle'}" class="axis">${row.month || row.day}</text>`;
      }).join('')}
    </svg>`;
}

function renderFindings() {
  const totals = source.totals;
  const latest = source.highlights.latest_month;
  const best = source.highlights.best_month;
  const worst = source.highlights.worst_month;
  const change = source.highlights.period_change_pct_first_to_latest;
  const corr = source.highlights.correlation_energy_vs_fluids;
  const direction = change > 0 ? 'aumento' : 'reduccion';
  byId('executiveFindings').innerHTML = [
    `El indice ponderado del periodo es <strong>${fmt1.format(totals.weighted_index_kwh_per_bbl)} kWh/bbl</strong>, calculado con ${formatEnergy(totals.energy_kwh)} y ${formatBbl(totals.fluids_bbl)}.`,
    `El mejor mes fue <strong>${best.month}</strong> con ${fmt1.format(best.index_kwh_per_bbl)} kWh/bbl; el peor fue <strong>${worst.month}</strong> con ${fmt1.format(worst.index_kwh_per_bbl)} kWh/bbl.`,
    `Entre el primer mes y ${latest.month} se observa un ${direction} de <strong>${fmtPct.format(Math.abs(change))}%</strong> en el indice mensual.`,
    `La correlacion energia-fluidos es <strong>${fmt1.format(corr)}</strong>; la energia no sube de forma perfectamente proporcional al volumen, por eso conviene revisar cargas base y operacion fuera del punto eficiente.`
  ].map((item) => `<li>${item}</li>`).join('');

  byId('opportunities').innerHTML = [
    `Revisar los dias por encima del percentil 75 (${fmt1.format(totals.p75_kwh_per_bbl)} kWh/bbl): son candidatos para validar equipos en servicio, bombas operando fuera de curva, recirculaciones o restricciones de proceso.`,
    `Usar el percentil 25 (${fmt1.format(totals.baseline_p25_kwh_per_bbl)} kWh/bbl) como referencia interna inicial. No es una meta contractual; sirve para detectar brechas operativas alcanzables con datos reales del mismo sistema.`,
    `Cruzar los picos del indice con paradas, mantenimiento de bombas, cambios de pozo, presion de inyeccion y equipos auxiliares. El dashboard muestra el cuando; la causa debe confirmarse con bitacora operacional.`,
    `Mantener separado Toro Sentado. Mezclar generacion local con red importada ocultaria la eficiencia real de Jaguar + CCS.`
  ].map((item) => `<li>${item}</li>`).join('');
}

function renderTables() {
  const months = filteredMonthly().slice().reverse();
  byId('monthlyTable').innerHTML = months.map((row) => `
    <tr>
      <td>${row.month}</td>
      <td>${fmt1.format(row.index_kwh_per_bbl)}</td>
      <td>${formatEnergy(row.energy_kwh)}</td>
      <td>${formatBbl(row.fluids_bbl)}</td>
      <td>${row.delta_vs_prev_pct === '' ? '-' : `${fmtPct.format(row.delta_vs_prev_pct)}%`}</td>
    </tr>
  `).join('');

  const critical = source.high_index_days.filter((row) => dailyInRange(row.day)).slice(0, 10);
  byId('criticalDays').innerHTML = critical.map((row) => `
    <tr>
      <td>${row.day}</td>
      <td>${fmt1.format(row.energy_index_kwh_per_bbl)}</td>
      <td>${formatEnergy(row.energy_kwh_imported_jaguar_ccs)}</td>
      <td>${formatBbl(row.total_fluids_bbl)}</td>
    </tr>
  `).join('');
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
  const key = state.mode === 'monthly' ? 'index_kwh_per_bbl' : 'energy_index_kwh_per_bbl';
  const delta = ((Number(last[key]) / Number(prev[key])) - 1) * 100;
  el.textContent = `${delta >= 0 ? '+' : ''}${fmtPct.format(delta)}% vs anterior`;
  el.className = `signal ${delta > 2 ? 'bad' : delta < -2 ? 'good' : 'warn'}`;
}

function renderCharts() {
  const records = state.mode === 'monthly' ? filteredMonthly() : filteredDaily();
  if (state.mode === 'monthly') {
    lineChart('indexChart', records, 'month', 'index_kwh_per_bbl');
    barChart('energyFluidChart', records);
  } else {
    lineChart('indexChart', records, 'day', 'energy_index_kwh_per_bbl', 'rolling_7d_index');
    barChart('energyFluidChart', records);
  }
  renderTrendSignal(records);
}

function render() {
  renderKpis();
  renderCharts();
  renderFindings();
  renderTables();
}

async function init() {
  const response = await fetch('./data.json');
  source = await response.json();
  setFilters();
  render();
  byId('viewMode').addEventListener('change', (event) => {
    state.mode = event.target.value;
    render();
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
    byId('viewMode').value = 'monthly';
    render();
  });
}

init().catch((error) => {
  document.body.innerHTML = `<main class="panel"><h1>No se pudo cargar el dashboard</h1><p>${error.message}</p></main>`;
});
