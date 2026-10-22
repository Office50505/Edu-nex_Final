const CLARITY_ENDPOINT = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';
const CACHE_TTL_MS = 15 * 60 * 1000;

let cachedResult = null;
let cachedAt = 0;

function numberFrom(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricRows(payload, metricName) {
  const metric = (Array.isArray(payload) ? payload : []).find((item) => (
    String(item?.metricName || '').trim().toLowerCase() === metricName.toLowerCase()
  ));
  return Array.isArray(metric?.information) ? metric.information : [];
}

function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + numberFrom(row?.[field]), 0);
}

function pickDimensionValue(row, dimension) {
  return row?.[dimension] || row?.URL || row?.Device || row?.['Country/Region'] || row?.Source || row?.OS || row?.Browser || 'Unknown';
}

function topRows(payload, metricName, dimension, valueField, limit = 6) {
  return metricRows(payload, metricName)
    .map((row) => ({
      label: pickDimensionValue(row, dimension),
      value: numberFrom(row?.[valueField]),
      sessions: numberFrom(row?.totalSessionCount),
      users: numberFrom(row?.distantUserCount || row?.distinctUserCount),
    }))
    .filter((row) => row.value > 0 || row.sessions > 0 || row.users > 0)
    .sort((a, b) => (b.value || b.sessions || b.users) - (a.value || a.sessions || a.users))
    .slice(0, limit);
}

async function fetchClarityExport({ token, numOfDays, dimension }) {
  const params = new URLSearchParams({ numOfDays: String(numOfDays), dimension1: dimension });
  const response = await fetch(`${CLARITY_ENDPOINT}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const message = text ? `${response.status}: ${text.slice(0, 240)}` : `${response.status}: ${response.statusText}`;
    throw new Error(`Clarity export failed (${dimension}): ${message}`);
  }
  return text ? JSON.parse(text) : [];
}

function summarizeClarity({ urlPayload, devicePayload, countryPayload, sourcePayload, numOfDays }) {
  const trafficRows = metricRows(urlPayload, 'Traffic');
  const rageClickRows = metricRows(urlPayload, 'Rage Click Count');
  const deadClickRows = metricRows(urlPayload, 'Dead Click Count');
  const errorClickRows = metricRows(urlPayload, 'Error Click Count');
  const scriptErrorRows = metricRows(urlPayload, 'Script Error Count');
  const engagementRows = metricRows(urlPayload, 'Engagement Time');
  const scrollRows = metricRows(urlPayload, 'Scroll Depth');

  return {
    configured: true,
    numOfDays,
    fetchedAt: new Date().toISOString(),
    totals: {
      sessions: sumField(trafficRows, 'totalSessionCount'),
      botSessions: sumField(trafficRows, 'totalBotSessionCount'),
      users: sumField(trafficRows, 'distantUserCount') || sumField(trafficRows, 'distinctUserCount'),
      rageClicks: sumField(rageClickRows, 'rageClickCount'),
      deadClicks: sumField(deadClickRows, 'deadClickCount'),
      errorClicks: sumField(errorClickRows, 'errorClickCount'),
      scriptErrors: sumField(scriptErrorRows, 'scriptErrorCount'),
      engagementSeconds: sumField(engagementRows, 'totalTime'),
      scrollDepth: scrollRows.length
        ? Math.round(scrollRows.reduce((sum, row) => sum + numberFrom(row?.scrollDepth), 0) / scrollRows.length)
        : 0,
    },
    topPages: topRows(urlPayload, 'Traffic', 'URL', 'totalSessionCount', 8),
    rageClickPages: topRows(urlPayload, 'Rage Click Count', 'URL', 'rageClickCount', 8),
    deadClickPages: topRows(urlPayload, 'Dead Click Count', 'URL', 'deadClickCount', 8),
    devices: topRows(devicePayload, 'Traffic', 'Device', 'totalSessionCount', 6),
    countries: topRows(countryPayload, 'Traffic', 'Country/Region', 'totalSessionCount', 6),
    sources: topRows(sourcePayload, 'Traffic', 'Source', 'totalSessionCount', 6),
  };
}

async function getClarityDashboardInsights() {
  const token = process.env.CLARITY_API_TOKEN
    || process.env.CLARITY_DATA_EXPORT_TOKEN
    || process.env.CLARITY_API_KEY
    || process.env.MICROSOFT_CLARITY_API_TOKEN
    || process.env.MS_CLARITY_API_TOKEN;
  if (!token) {
    return {
      configured: false,
      reason: 'Backend Clarity Data Export token is not configured. Set CLARITY_API_TOKEN on the API server and restart it.',
    };
  }

  const now = Date.now();
  if (cachedResult && now - cachedAt < CACHE_TTL_MS) return cachedResult;

  const requestedDays = Number(process.env.CLARITY_NUM_DAYS || 3);
  const numOfDays = [1, 2, 3].includes(requestedDays) ? requestedDays : 3;
  const [urlPayload, devicePayload, countryPayload, sourcePayload] = await Promise.all([
    fetchClarityExport({ token, numOfDays, dimension: 'URL' }),
    fetchClarityExport({ token, numOfDays, dimension: 'Device' }),
    fetchClarityExport({ token, numOfDays, dimension: 'Country/Region' }),
    fetchClarityExport({ token, numOfDays, dimension: 'Source' }),
  ]);

  cachedResult = summarizeClarity({ urlPayload, devicePayload, countryPayload, sourcePayload, numOfDays });
  cachedAt = now;
  return cachedResult;
}

module.exports = {
  getClarityDashboardInsights,
};
