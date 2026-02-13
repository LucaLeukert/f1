const seasonSelect = document.querySelector('#seasonSelect');
const eventSelect = document.querySelector('#eventSelect');
const sessionSelect = document.querySelector('#sessionSelect');
const analyzeBtn = document.querySelector('#analyzeBtn');
const exportBtn = document.querySelector('#exportBtn');
const runBody = document.querySelector('#longRunTable tbody');
const teamBody = document.querySelector('#teamTable tbody');
const chart = document.querySelector('#lapChart');
const ctx = chart.getContext('2d');

const provider = createProvider();
let currentSessionData = null;
let latestRuns = [];

init();

async function init() {
  const seasons = await provider.getSeasons();
  fillSelect(seasonSelect, seasons.map((s) => ({ value: s, label: String(s) })));
  await onSeasonChange();
  seasonSelect.addEventListener('change', onSeasonChange);
  eventSelect.addEventListener('change', onEventChange);
  analyzeBtn.addEventListener('click', analyze);
  exportBtn.addEventListener('click', exportCsv);
}

async function onSeasonChange() {
  const events = await provider.getEvents(Number(seasonSelect.value));
  fillSelect(eventSelect, events.map((e) => ({ value: e.id, label: e.name })));
  await onEventChange();
}

async function onEventChange() {
  const sessions = await provider.getSessions(eventSelect.value);
  fillSelect(sessionSelect, sessions.map((s) => ({ value: s.id, label: s.name })));
}

function fillSelect(el, options) {
  el.innerHTML = '';
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    el.appendChild(opt);
  }
}

async function analyze() {
  currentSessionData = await provider.getSessionData(Number(seasonSelect.value), eventSelect.value, sessionSelect.value);
  const worker = new Worker(new URL('./longRunWorker.js', import.meta.url), { type: 'module' });

  const result = await new Promise((resolve) => {
    worker.onmessage = (event) => resolve(event.data);
    worker.postMessage({ payload: currentSessionData });
  });
  worker.terminate();

  latestRuns = result.runs;
  renderRuns(result.runs);
  renderTeams(result.teams);
  renderChart(currentSessionData.laps);
  exportBtn.disabled = result.runs.length === 0;
}

function renderRuns(runs) {
  runBody.innerHTML = '';
  for (const run of runs) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${run.driver}</td><td>${run.team}</td><td>${run.compound}</td><td>${run.laps}</td><td>${run.paceMs}</td><td>${run.degradationMsPerLap}</td><td>${run.consistencyStd}</td><td class="${run.confidence >= 80 ? 'good': ''}">${run.confidence}</td>`;
    runBody.appendChild(tr);
  }
}

function renderTeams(teams) {
  teamBody.innerHTML = '';
  for (const t of teams) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${t.team}</td><td>${t.avgPaceMs}</td><td>${t.avgDegMsPerLap}</td><td>${t.interpretation}</td>`;
    teamBody.appendChild(tr);
  }
}

function renderChart(laps) {
  ctx.clearRect(0, 0, chart.width, chart.height);
  const drivers = [...new Set(laps.map((l) => l.driver))];
  const colors = ['#ef4444','#22c55e','#3b82f6','#f59e0b','#a855f7','#06b6d4'];
  const minLap = Math.min(...laps.map((l) => l.lap));
  const maxLap = Math.max(...laps.map((l) => l.lap));
  const minTime = Math.min(...laps.map((l) => l.lapTimeMs));
  const maxTime = Math.max(...laps.map((l) => l.lapTimeMs));

  for (let i = 0; i < drivers.length; i += 1) {
    const dLaps = laps.filter((l) => l.driver === drivers[i]);
    ctx.strokeStyle = colors[i % colors.length];
    ctx.beginPath();
    for (let j = 0; j < dLaps.length; j += 1) {
      const x = scale(dLaps[j].lap, minLap, maxLap, 30, chart.width - 20);
      const y = scale(dLaps[j].lapTimeMs, minTime, maxTime, chart.height - 20, 20);
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillText(drivers[i], chart.width - 80, 20 + i * 16);
  }
}

function scale(v, min, max, outMin, outMax) {
  if (max === min) return outMin;
  return outMin + ((v - min) * (outMax - outMin)) / (max - min);
}

function exportCsv() {
  const header = 'driver,team,compound,laps,paceMs,degradationMsPerLap,consistencyStd,confidence';
  const rows = latestRuns.map((r) => [r.driver,r.team,r.compound,r.laps,r.paceMs,r.degradationMsPerLap,r.consistencyStd,r.confidence].join(','));
  const csv = `${header}\n${rows.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'long-runs.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function createProvider() {
  return {
    async getSeasons() {
      return [2025];
    },
    async getEvents() {
      return [{ id: 'bahrain', name: 'Bahrain GP' }];
    },
    async getSessions() {
      return [{ id: 'fp2', name: 'FP2' }];
    },
    async getSessionData() {
      const cacheKey = 'f1_2025_bahrain_fp2_v1';
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
      const res = await fetch('public/data/sample-fp2-2025-bahrain.json');
      const data = await res.json();
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    }
  };
}
