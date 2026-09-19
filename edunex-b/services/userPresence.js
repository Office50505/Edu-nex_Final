// Background browser tabs may throttle timers to around one minute. A three-minute
// window avoids showing an actively signed-in learner as offline between pings.
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

function presenceFromPing(lastPingAt, now = Date.now()) {
  const timestamp = lastPingAt ? new Date(lastPingAt).getTime() : NaN;
  return {
    isOnline: Number.isFinite(timestamp) && now - timestamp <= ONLINE_WINDOW_MS,
    lastSeenAt: Number.isFinite(timestamp) ? new Date(timestamp) : null,
  };
}

module.exports = { ONLINE_WINDOW_MS, presenceFromPing };
