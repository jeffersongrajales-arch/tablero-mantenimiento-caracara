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

function monthInRange(month) {
  return (!state.from || month >= state.from) && (!state.to || month <= state.to);
}

function dailyInRange(day) {
  const month = day.slice(0, 7);
  return monthInRange(month);
}

function num(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return Number(row[key] || 0);
  }
  return 0;
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

function getIndex(row) {
  const energy = getEnergy(row);
  const fluids = getSelectedFluids(row);
  return fluids ? energy / fluids : 0;
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

function selectedTotals(records) {
  const energy = records.reduce((acc, row) => acc + getEnergy(row), 0);
  const fluids = records.reduce((acc, row) => acc + getSelectedFluids(row), 0);
  return {
    energy,
    fluids,
    index: fluids ? energy / fluids : 0,
  };
}

function indexNote() {
  if (state.station === 'total') return 'Indice real consolidado Jaguar + CCS';
  return 'Referencia operativa con energia total importada';
}

function renderKpis() {
  const daily = filteredDaily();
  const monthly = filteredMonthly();
  const totals = selectedTotals(daily);
  const latest = monthly[monthly.length - 1] || source.highlights.latest_month;
  const baseline = source.totals.baseline_p25_kwh_per_bbl;
  const latestIndex = latest ? (getEnergy(latest) / (state.station === 'total' ? getTotalFluids(latest) : getSelectedFluids(latest) || getTotalFluids(latest))) : 0;
  const latestFluids = latest ? (state.station === 'total' ? getTotalFluids(latest) : getSelectedFluids(latest)) : 0;
  const saving = Math.max(0, (latestIndex - baseline) * latestFluids);
  const station = stationTotals(daily);
  const p75 = source.totals.p75_kwh_per_bbl;
  const p75Days = daily.filter((row) => getIndex(row) > p75).length;
  const dominant = station.ccs >= station.jaguar ? 'CCS' : 'Jaguar';

  byId('kpiIndex').textContent = fmt1.format(totals.index);
  byId('kpiEnergy').textContent = formatEnergy(totals.energy);
  byId('kpiFluids').textContent = formatBbl(totals.fluids);
  byId('kpiSavings').textContent = formatEnergy(saving);
  byId('kpiIndexNote').textContent = indexNote();
  byId('kpiEnergyNote').textContent = state.station === 'total' ? 'Jaguar + Caracara Sur' : 'Energia total usada como referencia';
  byId('kpiFluidsNote').textContent = state.station === 'total' ? 'Crudo + agua inyectada' : `Fluidos de ${stationNames[state.station]}`;
  byId('kpiCcsFluids').textContent = formatBbl(station.ccs);
  byId('kpiJaguarFluids').textContent = formatBbl(station.jaguar);
  byId('kpiCcsShare').textContent = `${fmtPct.format(station.ccsShare * 100)}% del volumen`;
  byId('kpiJaguarShare').textContent = `${fmtPct.format(station.jaguarShare * 100)}% del volumen`;
  byId('kpiDominantStation').textContent = dominant;
  byId('kpiP75Days').textContent = fmt.format(p75Days);
  byId('periodLabel').textContent = `${source.period.start} a ${source.period.end} · ${source.period.days} dias fuente`;
}

function chartScales(values, width, height, padding) {
  const cleanValues = values.filter((value) => Number.isFinite(value));
  const min = Math.min(...cleanValues);
  const max = Math.max(...cleanValues);
  const span = max - min || 1;
  return {
    x: (i, count) => padding.left + (count <= 1 ? 0 : i * (width - padding.left - padding.right) / (count - 1)),
    y: (v) => padding.top + (max - v) * (height - padding.top - padding.bottom) / span,
    min,
    max,
  };
}

function lineChart(container, records, valueGetter, secondaryGetter) {
  const el = byId(container);
  if (!records.length) {
    el.innerHTML = '<p>No hay datos para el periodo seleccionado.</p>';
    return;
  }
  const width = 760;
  const height = 310;
  const padding = { top: 18, right: 24, bottom: 44, left: 52 };
  const values = records.flatMap((row) => [valueGetter(row), secondaryGetter ? secondaryGetter(row) : valueGetter(row)]).filter(Boolean);
  const scale = chartScales(values, width, height, padding);
  const path = records.map((row, i) => `${i ? 'L' : 'M'}${scale.x(i, records.length).toFixed(1)},${scale.y(valueGetter(row)).toFixed(1)}`).join(' ');
  const secondaryPath = secondaryGetter ? records.map((row, i) => `${i ? 'L' : 'M'}${scale.x(i, records.length).toFixed(1)},${scale.y(secondaryGetter(row)).toFixed(1)}`).join(' ') : '';
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
        return `<text x="${scale.x(i, records.length)}" y="${height - 12}" text-anchor="${i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle'}" class="axis">${getLabel(row)}</text>`;
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
  const height = 310;
  const padding = { top: 18, right: 22, bottom: 44, left: 52 };
  const firstEnergy = getEnergy(records[0]) || 1;
  const firstFluids = getSelectedFluids(records[0]) || 1;
  const energyVals = records.map((row) => (getEnergy(row) / firstEnergy) * 100);
  const fluidVals = records.map((row) => (getSelectedFluids(row) / firstFluids) * 100);
  const max = Math.max(...energyVals, ...fluidVals, 100) || 100;
  const min = Math.min(...energyVals, ...fluidVals, 100) || 0;
  const span = max - min || 1;
  const barArea = width - padding.left - padding.right;
  const group = barArea / records.length;
  const bar = Math.max(3, Math.min(18, group / 3));
  const y = (v) => padding.top + (max - v) * (height - padding.top - padding.bottom) / span;
  const labels = records.length > 9 ? records.filter((_, i) => i === 0 || i === records.length - 1 || i === Math.floor(records.length / 2)) : records;
  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      ${[min, 100, max].map((tick) => `<line class="grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${y(tick)}" y2="${y(tick)}"></line>`).join('')}
      ${[min, 100, max].map((tick) => `<text x="8" y="${y(tick) + 4}" class="axis">${fmt.format(tick)}</text>`).join('')}
      ${records.map((row, i) => {
        const x = padding.left + i * group + group / 2;
        const e = energyVals[i];
        const f = fluidVals[i];
        return `<rect class="bar-energy" x="${x - bar - 1}" y="${y(e)}" width="${bar}" height="${height - padding.bottom - y(e)}"></rect>
          <rect class="bar-fluid" x="${x + 1}" y="${y(f)}" width="${bar}" height="${height - padding.bottom - y(f)}"></rect>`;
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
  const height = 310;
  const padding = { top: 18, right: 22, bottom: 44, left: 52 };
  const showTotal = state.station === 'total';
  const ccsVals = records.map((row) => getCcsFluids(row) / 1000);
  const jaguarVals = records.map((row) => getJaguarFluids(row) / 1000);
  const selectedVals = records.map((row) => getSelectedFluids(row) / 1000);
  const allValues = showTotal ? [...ccsVals, ...jaguarVals] : selectedVals;
  const max = Math.max(...allValues) || 1;
  const barArea = width - padding.left - padding.right;
  const group = barArea / records.length;
  const bar = Math.max(3, Math.min(22, showTotal ? group / 3 : group / 2));
  const y = (v) => padding.top + (max - v) * (height - padding.top - padding.bottom) / max;
  const labels = records.length > 9 ? records.filter((_, i) => i === 0 || i === records.length - 1 || i === Math.floor(records.length / 2)) : records;
  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      ${[0, max / 2, max].map((tick) => `<line class="grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${y(tick)}" y2="${y(tick)}"></line>`).join('')}
      ${[0, max / 2, max].map((tick) => `<text x="8" y="${y(tick) + 4}" class="axis">${fmt.format(tick)}k</text>`).join('')}
      ${records.map((row, i) => {
        const x = padding.left + i * group + group / 2;
        if (!showTotal) {
          const v = selectedVals[i];
          const cls = state.station === 'jaguar' ? 'bar-jaguar' : 'bar-ccs';
          return `<rect class="${cls}" x="${x - bar / 2}" y="${y(v)}" width="${bar}" height="${height - padding.bottom - y(v)}"></rect>`;
        }
        const c = ccsVals[i];
        const j = jaguarVals[i];
        return `<rect class="bar-ccs" x="${x - bar - 1}" y="${y(c)}" width="${bar}" height="${height - padding.bottom - y(c)}"></rect>
          <rect class="bar-jaguar" x="${x + 1}" y="${y(j)}" width="${bar}" height="${height - padding.bottom - y(j)}"></rect>`;
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
  const totals = selectedTotals(records);
  const dominant = station.ccs >= station.jaguar ? 'CCS' : 'Jaguar';
  const gap = Math.abs(station.ccsShare - station.jaguarShare) * 100;
  const selected = stationNames[state.station];
  const note = state.station === 'total'
    ? 'El indice mostrado corresponde al sistema completo Jaguar + CCS.'
    : `La vista esta filtrada a fluidos de ${selected}. La energia sigue siendo la importada total porque no hay medicion separada por estacion.`;
  byId('stationSummary').innerHTML = `
    <div class="summary-row"><span>Vista seleccionada</span><strong>${selected}</strong></div>
    <div class="summary-row"><span>Indice mostrado</span><strong>${fmt1.format(totals.index)} kWh/bbl</strong></div>
    <div class="summary-row"><span>Participacion CCS</span><strong>${fmtPct.format(station.ccsShare * 100)}%</strong></div>
    <div class="summary-row"><span>Participacion Jaguar</span><strong>${fmtPct.format(station.jaguarShare * 100)}%</strong></div>
    <div class="summary-note">La estacion dominante en volumen es <strong>${dominant}</strong>. La diferencia de participacion es de ${fmtPct.format(gap)} puntos porcentuales.</div>
    <div class="summary-note warn-note">${note}</div>
  `;
}

function renderFindings() {
  const records = activeRecords();
  const totals = selectedTotals(records);
  const monthly = filteredMonthly();
  const best = monthly.reduce((acc, row) => !acc || getIndex(row) < getIndex(acc) ? row : acc, null);
  const worst = monthly.reduce((acc, row) => !acc || getIndex(row) > getIndex(acc) ? row : acc, null);
  const first = monthly[0];
  const latest = monthly[monthly.length - 1];
  const change = first && latest && getIndex(first) ? ((getIndex(latest) / getIndex(first)) - 1) * 100 : 0;
  const direction = change > 0 ? 'aumento' : 'reduccion';
  const selected = stationNames[state.station];

  byId('executiveFindings').innerHTML = [
    `La vista seleccionada es <strong>${selected}</strong>. El indice ponderado mostrado es <strong>${fmt1.format(totals.index)} kWh/bbl</strong>.`,
    `El mejor mes de la vista fue <strong>${best?.month || '-'}</strong> con ${best ? fmt1.format(getIndex(best)) : '-'} kWh/bbl; el peor fue <strong>${worst?.month || '-'}</strong> con ${worst ? fmt1.format(getIndex(worst)) : '-'} kWh/bbl.`,
    `Entre el primer mes y ${latest?.month || '-'} se observa un ${direction} de <strong>${fmtPct.format(Math.abs(change))}%</strong> en el indice mensual.`,
    state.station === 'total'
      ? `La correlacion energia-fluidos es <strong>${fmt1.format(source.highlights.correlation_energy_vs_fluids)}</strong>; la energia no sube de forma perfectamente proporcional al volumen.`
      : `Para esta vista, el resultado ayuda a leer aporte de fluidos por estacion, pero no reemplaza una medicion electrica dedicada por estacion.`
  ].map((item) => `<li>${item}</li>`).join('');

  byId('opportunities').innerHTML = [
    `Revisar los dias por encima del percentil 75 (${fmt1.format(source.totals.p75_kwh_per_bbl)} kWh/bbl): validar equipos en servicio, bombas fuera de curva, recirculaciones o restricciones de proceso.`,
    `Usar el percentil 25 (${fmt1.format(source.totals.baseline_p25_kwh_per_bbl)} kWh/bbl) como referencia interna inicial. No es meta contractual; es una brecha operacional con datos reales del sistema.`,
    `Cruzar los picos con bitacora operacional, mantenimiento de bombas, cambios de pozo, presion de inyeccion y equipos auxiliares.`,
    `Mantener separado Toro Sentado. Mezclar generacion local con red importada ocultaria la eficiencia real de Jaguar + CCS.`
  ].map((item) => `<li>${item}</li>`).join('');
}

function renderTables() {
  const months = filteredMonthly().slice().reverse();
  byId('monthlyTable').innerHTML = months.map((row) => `
    <tr>
      <td>${row.month}</td>
      <td>${fmt1.format(getIndex(row))}</td>
      <td>${formatEnergy(getEnergy(row))}</td>
      <td>${formatBbl(getSelectedFluids(row))}</td>
      <td>${row.delta_vs_prev_pct == null || row.delta_vs_prev_pct === '' ? '-' : `${fmtPct.format(row.delta_vs_prev_pct)}%`}</td>
    </tr>
  `).join('');

  const p75 = source.totals.p75_kwh_per_bbl;
  const critical = filteredDaily().slice().sort((a, b) => getIndex(b) - getIndex(a)).slice(0, 10);
  byId('criticalDays').innerHTML = critical.map((row) => {
    const index = getIndex(row);
    return `
      <tr class="${index > p75 ? 'critical-row' : ''}">
        <td>${row.day}</td>
        <td>${fmt1.format(index)}</td>
        <td>${formatEnergy(getEnergy(row))}</td>
        <td>${formatBbl(getSelectedFluids(row))}</td>
        <td>${index > p75 ? 'Sobre P75' : 'Normal'}</td>
      </tr>
    `;
  }).join('');

  byId('stationTable').innerHTML = months.map((row) => {
    const total = getTotalFluids(row);
    const ccs = getCcsFluids(row);
    const jaguar = getJaguarFluids(row);
    const ccsShare = total ? ccs / total : 0;
    const jaguarShare = total ? jaguar / total : 0;
    const dominant = ccs >= jaguar ? 'CCS aporta mayor volumen' : 'Jaguar aporta mayor volumen';
    return `
      <tr>
        <td>${row.month}</td>
        <td>${fmt1.format(getEnergy(row) / (total || 1))}</td>
        <td>${formatBbl(ccs)}</td>
        <td>${fmtPct.format(ccsShare * 100)}%</td>
        <td>${formatBbl(jaguar)}</td>
        <td>${fmtPct.format(jaguarShare * 100)}%</td>
        <td>${dominant}</td>
      </tr>
    `;
  }).join('');
}

function renderTrendSignal(records) {
  const el = byId('trendSignal');
  const last = records[records.length - 1];
  const prev = records[records.length - 2];
  if (!last || !prev || !getIndex(prev)) {
    el.textContent = 'Sin comparativo';
    el.className = 'signal';
    return;
  }
  const delta = ((getIndex(last) / getIndex(prev)) - 1) * 100;
  el.textContent = `${delta >= 0 ? '+' : ''}${fmtPct.format(delta)}% vs anterior`;
  el.className = `signal ${delta > 2 ? 'bad' : delta < -2 ? 'good' : 'warn'}`;
}

function renderCharts() {
  const records = activeRecords();
  const selected = stationNames[state.station];
  byId('indexChartNote').textContent = state.station === 'total'
    ? 'Menor valor indica mejor eficiencia energetica consolidada.'
    : `Vista ${selected}: energia total importada dividida por fluidos de la estacion seleccionada.`;

  if (state.mode === 'monthly') {
    lineChart('indexChart', records, getIndex);
  } else {
    lineChart('indexChart', records, getIndex, (row) => Number(row.rolling_7d_index || getIndex(row)));
  }
  normalizedBarChart('energyFluidChart', records);
  stationFluidChart('stationFluidChart', records);
  renderTrendSignal(records);
}

function render() {
  renderKpis();
  renderCharts();
  renderStationSummary();
  renderFindings();
  renderTables();
}

async function init() {
  const response = await fetch('./data.json?v=20260915-fix1', { cache: 'no-store' });
  source = await response.json();
  setFilters();
  render();
  byId('viewMode').addEventListener('change', (event) => {
    state.mode = event.target.value;
    render();
  });
  byId('stationMode').addEventListener('change', (event) => {
    state.station = event.target.value;
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
    state.station = 'total';
    byId('viewMode').value = 'monthly';
    byId('stationMode').value = 'total';
    render();
  });
}

init().catch((error) => {
  document.body.innerHTML = `<main class="panel"><h1>No se pudo cargar el dashboard</h1><p>${error.message}</p></main>`;
});
