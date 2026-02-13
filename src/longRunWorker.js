self.onmessage = (event) => {
  const { payload } = event.data;
  const result = analyze(payload);
  self.postMessage(result);
};

function analyze(sessionData) {
  const byDriver = new Map();
  for (const lap of sessionData.laps) {
    if (!byDriver.has(lap.driver)) byDriver.set(lap.driver, []);
    byDriver.get(lap.driver).push(lap);
  }

  const runs = [];
  for (const driver of sessionData.drivers) {
    const laps = (byDriver.get(driver.code) || []).sort((a, b) => a.lap - b.lap);
    const validLaps = laps.filter((l) => l.valid !== false);
    if (validLaps.length < 8) continue;

    const lapTimes = validLaps.map((l) => l.lapTimeMs);
    const filtered = filterOutliers(lapTimes);
    if (filtered.length < 8) continue;

    const trimmed = trimmedMean(filtered, 0.1);
    const deg = slope(filtered);
    const std = stdev(filtered);
    const confidence = confidenceScore(filtered.length, std, deg);
    const compound = dominantCompound(validLaps) || driver.compound || 'UNK';

    runs.push({
      driver: driver.code,
      team: driver.team || 'Unknown',
      compound,
      laps: filtered.length,
      paceMs: Math.round(trimmed),
      degradationMsPerLap: Number(deg.toFixed(1)),
      consistencyStd: Math.round(std),
      confidence
    });
  }

  const teams = aggregateTeams(runs);
  return { runs, teams };
}

function dominantCompound(laps) {
  const counter = new Map();
  for (const lap of laps) {
    const c = lap.compound || 'UNK';
    counter.set(c, (counter.get(c) || 0) + 1);
  }
  return [...counter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function filterOutliers(values) {
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  const mad = median(deviations) || 1;
  const threshold = med + 2.5 * mad;
  return values.filter((v) => v <= threshold);
}

function aggregateTeams(runs) {
  const map = new Map();
  for (const r of runs) {
    if (!map.has(r.team)) map.set(r.team, []);
    map.get(r.team).push(r);
  }
  return [...map.entries()].map(([team, values]) => {
    const avgPace = avg(values.map((v) => v.paceMs));
    const avgDeg = avg(values.map((v) => v.degradationMsPerLap));
    const interpretation = avgDeg < 230
      ? 'Low degradation + stable race pace'
      : 'Higher degradation, manage tyre drop-off';
    return {
      team,
      avgPaceMs: Math.round(avgPace),
      avgDegMsPerLap: Number(avgDeg.toFixed(1)),
      interpretation
    };
  }).sort((a, b) => a.avgPaceMs - b.avgPaceMs);
}

function confidenceScore(lapCount, std, deg) {
  let score = 50;
  score += Math.min(25, lapCount * 2);
  score += Math.max(0, 15 - std / 20);
  score += Math.max(0, 10 - Math.abs(deg - 200) / 40);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function slope(values) {
  const n = values.length;
  const xMean = (n + 1) / 2;
  const yMean = avg(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i + 1;
    num += (x - xMean) * (values[i] - yMean);
    den += (x - xMean) ** 2;
  }
  return den ? num / den : 0;
}

function trimmedMean(values, trimFrac) {
  const sorted = [...values].sort((a, b) => a - b);
  const k = Math.floor(values.length * trimFrac);
  const trimmed = sorted.slice(k, sorted.length - k);
  return avg(trimmed.length ? trimmed : sorted);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function stdev(values) {
  const m = avg(values);
  const v = avg(values.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

function avg(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
