const OPENF1_BASE = 'https://api.openf1.org/v1';

const sourceSelect = document.querySelector('#sourceSelect');
const seasonSelect = document.querySelector('#seasonSelect');
const eventSelect = document.querySelector('#eventSelect');
const sessionSelect = document.querySelector('#sessionSelect');
const analyzeBtn = document.querySelector('#analyzeBtn');
const refreshLiveBtn = document.querySelector('#refreshLiveBtn');
const toggleAutoBtn = document.querySelector('#toggleAutoBtn');
const exportBtn = document.querySelector('#exportBtn');
const statusBadge = document.querySelector('#statusBadge');
const runBody = document.querySelector('#longRunTable tbody');
const teamBody = document.querySelector('#teamTable tbody');
const liveBody = document.querySelector('#liveTable tbody');
const chart = document.querySelector('#lapChart');
const ctx = chart.getContext('2d');

const provider = createProvider();
let currentSessionData = null;
let latestRuns = [];
let autoRefresh = null;

init();

async function init() {
  bindEvents();
  await hydrateSelectors();
  await refreshLiveTiming();
}

function bindEvents() {
  sourceSelect.addEventListener('change', async () => {
    stopAutoRefresh();
    await hydrateSelectors();
    await refreshLiveTiming();
  });
  seasonSelect.addEventListener('change', onSeasonChange);
  eventSelect.addEventListener('change', onEventChange);
  analyzeBtn.addEventListener('click', analyze);
  refreshLiveBtn.addEventListener('click', refreshLiveTiming);
  toggleAutoBtn.addEventListener('click', toggleAutoRefresh);
  exportBtn.addEventListener('click', exportCsv);
}

async function hydrateSelectors() {
  setStatus('Loading sessions...', 'warn');
  const seasons = await provider.getSeasons(sourceSelect.value);
  fillSelect(seasonSelect, seasons.map((s) => ({ value: s.value, label: s.label })));
  await onSeasonChange();
  setStatus('Ready', 'good');
}

async function onSeasonChange() {
  const events = await provider.getEvents(sourceSelect.value, Number(seasonSelect.value));
  fillSelect(eventSelect, events.map((e) => ({ value: e.id, label: e.name })));
  await onEventChange();
}

async function onEventChange() {
  const sessions = await provider.getSessions(sourceSelect.value, eventSelect.value);
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
  try {
    setStatus('Analyzing long runs...', 'warn');
    currentSessionData = await provider.getSessionData({
      source: sourceSelect.value,
      season: Number(seasonSelect.value),
      eventId: eventSelect.value,
      sessionId: sessionSelect.value
    });

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
    setStatus(`Analysis done (${result.runs.length} runs)`, 'good');
  } catch (err) {
    console.error(err);
    setStatus(`Analyze failed: ${err.message}`, 'warn');
  }
}

async function refreshLiveTiming() {
  try {
    setStatus('Refreshing live timing...', 'warn');
    const rows = await provider.getLiveTiming({
      source: sourceSelect.value,
      eventId: eventSelect.value,
      sessionId: sessionSelect.value
    });
    renderLive(rows);
    setStatus(`Live updated (${rows.length} drivers)`, 'good');
  } catch (err) {
    console.error(err);
    setStatus(`Live fetch failed: ${err.message}`, 'warn');
  }
}

function toggleAutoRefresh() {
  if (autoRefresh) {
    stopAutoRefresh();
    return;
  }
  autoRefresh = setInterval(refreshLiveTiming, 15000);
  toggleAutoBtn.textContent = 'Stop Auto Refresh';
  setStatus('Auto refresh every 15s', 'good');
}

function stopAutoRefresh() {
  if (!autoRefresh) return;
  clearInterval(autoRefresh);
  autoRefresh = null;
  toggleAutoBtn.textContent = 'Start Auto Refresh';
}

function renderLive(rows) {
  liveBody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.position ?? '-'}</td><td>${row.driver}</td><td>${row.team ?? '-'}</td><td>${row.gap ?? '-'}</td><td>${row.updatedAt ?? '-'}</td>`;
    liveBody.appendChild(tr);
  }
}

function renderRuns(runs) {
  runBody.innerHTML = '';
  for (const run of runs) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${run.driver}</td><td>${run.team}</td><td>${run.compound}</td><td>${run.laps}</td><td>${run.paceMs}</td><td>${run.degradationMsPerLap}</td><td>${run.consistencyStd}</td><td class="${run.confidence >= 80 ? 'good' : 'warn'}">${run.confidence}</td>`;
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
  if (!laps.length) return;
  ctx.clearRect(0, 0, chart.width, chart.height);
  const drivers = [...new Set(laps.map((l) => l.driver))].slice(0, 10);
  const colors = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#14b8a6'];
  const minLap = Math.min(...laps.map((l) => l.lap));
  const maxLap = Math.max(...laps.map((l) => l.lap));
  const minTime = Math.min(...laps.map((l) => l.lapTimeMs));
  const maxTime = Math.max(...laps.map((l) => l.lapTimeMs));

  for (let i = 0; i < drivers.length; i += 1) {
    const dLaps = laps.filter((l) => l.driver === drivers[i]).sort((a, b) => a.lap - b.lap);
    ctx.strokeStyle = colors[i % colors.length];
    ctx.beginPath();
    for (let j = 0; j < dLaps.length; j += 1) {
      const x = scale(dLaps[j].lap, minLap, maxLap, 30, chart.width - 20);
      const y = scale(dLaps[j].lapTimeMs, minTime, maxTime, chart.height - 20, 20);
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillText(drivers[i], chart.width - 90, 18 + i * 14);
  }
}

function setStatus(text, type) {
  statusBadge.textContent = text;
  statusBadge.className = `badge ${type}`;
}

function scale(v, min, max, outMin, outMax) {
  if (max === min) return outMin;
  return outMin + ((v - min) * (outMax - outMin)) / (max - min);
}

function exportCsv() {
  const header = 'driver,team,compound,laps,paceMs,degradationMsPerLap,consistencyStd,confidence';
  const rows = latestRuns.map((r) => [r.driver, r.team, r.compound, r.laps, r.paceMs, r.degradationMsPerLap, r.consistencyStd, r.confidence].join(','));
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
  let openF1Cache = { sessions: [], meetings: [] };

  return {
    async getSeasons(source) {
      if (source === 'sample') return [{ value: 2025, label: '2025' }];
      const currentYear = new Date().getUTCFullYear();
      return [{ value: currentYear, label: String(currentYear) }];
    },

    async getEvents(source, season) {
      if (source === 'sample') return [{ id: 'bahrain', name: 'Bahrain GP' }];

      const meetings = await fetchJson(`${OPENF1_BASE}/meetings?year=${season}`);
      openF1Cache.meetings = meetings;
      return meetings.slice(-12).map((m) => ({ id: String(m.meeting_key), name: `${m.meeting_name} (${m.country_name})` }));
    },

    async getSessions(source, eventId) {
      if (source === 'sample') return [{ id: 'fp2', name: 'FP2' }];

      const sessions = await fetchJson(`${OPENF1_BASE}/sessions?meeting_key=${eventId}`);
      const practice = sessions.filter((s) => (s.session_type || '').toLowerCase().includes('practice'));
      openF1Cache.sessions = practice.length ? practice : sessions;
      return openF1Cache.sessions.map((s) => ({ id: String(s.session_key), name: `${s.session_name} (${s.date_start?.slice(0, 16).replace('T', ' ') || 'n/a'})` }));
    },

    async getSessionData({ source, season, eventId, sessionId }) {
      if (source === 'sample') {
        const cacheKey = 'f1_2025_bahrain_fp2_v1';
        const cached = localStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached);
        const res = await fetch('public/data/sample-fp2-2025-bahrain.json');
        const data = await res.json();
        localStorage.setItem(cacheKey, JSON.stringify(data));
        return data;
      }

      const sessionKey = Number(sessionId);
      const [drivers, laps, stints] = await Promise.all([
        fetchJson(`${OPENF1_BASE}/drivers?session_key=${sessionKey}`),
        fetchJson(`${OPENF1_BASE}/laps?session_key=${sessionKey}`),
        fetchJson(`${OPENF1_BASE}/stints?session_key=${sessionKey}`).catch(() => [])
      ]);

      const stintCompound = new Map();
      for (const s of stints) stintCompound.set(Number(s.driver_number), s.compound ?? s.tyre_compound ?? 'UNK');

      const normalizedDrivers = drivers.map((d) => ({
        code: d.name_acronym ?? d.broadcast_name?.slice(0, 3).toUpperCase() ?? String(d.driver_number),
        team: d.team_name ?? 'Unknown',
        compound: stintCompound.get(Number(d.driver_number)) ?? 'UNK',
        number: Number(d.driver_number)
      }));

      const driverMap = new Map(normalizedDrivers.map((d) => [d.number, d]));
      const normalizedLaps = laps
        .filter((l) => l.lap_duration && l.lap_number)
        .map((l) => ({
          driver: driverMap.get(Number(l.driver_number))?.code ?? String(l.driver_number),
          lap: Number(l.lap_number),
          lapTimeMs: Math.round(Number(l.lap_duration) * 1000),
          valid: !l.is_deleted,
          compound: l.compound ?? stintCompound.get(Number(l.driver_number)) ?? 'UNK'
        }));

      return {
        season,
        event: { id: eventId, name: openF1Cache.meetings.find((m) => String(m.meeting_key) === String(eventId))?.meeting_name ?? String(eventId) },
        session: { id: sessionId, name: openF1Cache.sessions.find((s) => String(s.session_key) === String(sessionId))?.session_name ?? String(sessionId) },
        drivers: normalizedDrivers,
        laps: normalizedLaps
      };
    },

    async getLiveTiming({ source, sessionId }) {
      if (source === 'sample') {
        return [
          { position: 1, driver: 'NOR', team: 'McLaren', gap: 'LEADER', updatedAt: new Date().toISOString() },
          { position: 2, driver: 'VER', team: 'Red Bull', gap: '+0.241', updatedAt: new Date().toISOString() },
          { position: 3, driver: 'LEC', team: 'Ferrari', gap: '+0.509', updatedAt: new Date().toISOString() }
        ];
      }

      const key = Number(sessionId);
      if (!key) return [];
      const [drivers, positions] = await Promise.all([
        fetchJson(`${OPENF1_BASE}/drivers?session_key=${key}`),
        fetchJson(`${OPENF1_BASE}/position?session_key=${key}`)
      ]);

      const driverMeta = new Map(drivers.map((d) => [Number(d.driver_number), {
        code: d.name_acronym ?? String(d.driver_number),
        team: d.team_name ?? 'Unknown'
      }]));

      const latestByDriver = new Map();
      for (const row of positions) {
        const dn = Number(row.driver_number);
        const ts = Date.parse(row.date || row.date_utc || '1970-01-01T00:00:00Z');
        const existing = latestByDriver.get(dn);
        if (!existing || ts > existing.ts) {
          latestByDriver.set(dn, {
            ts,
            position: Number(row.position),
            updatedAt: new Date(ts).toISOString()
          });
        }
      }

      return [...latestByDriver.entries()]
        .map(([driverNumber, pos]) => ({
          position: pos.position,
          driver: driverMeta.get(driverNumber)?.code ?? String(driverNumber),
          team: driverMeta.get(driverNumber)?.team ?? 'Unknown',
          gap: pos.position === 1 ? 'LEADER' : `P${pos.position}`,
          updatedAt: pos.updatedAt
        }))
        .sort((a, b) => a.position - b.position);
    }
  };
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}
