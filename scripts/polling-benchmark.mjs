import { STANDARD_PIDS } from '../pids-standard.js';
import { TOYOTA_PIDS } from '../pids-toyota.js';
import { selectPolledPids } from '../pid-selection.js';

function pidKey(pid) {
  return `${pid.protocol}:${pid.header || ''}:${pid.pid}:${pid.name}`;
}

function routeKey(pid) {
  return pid.protocol === 'toyota' ? `toyota:${pid.header || 'unknown'}` : 'standard';
}

function commandDurationMs(pid) {
  // Source: src/mock/mock-engine.js
  // MockELM AT/OBD baseline delay is 30ms, and Toyota 2101 is modeled as 180ms.
  // We use these as deterministic reference timings for relative scheduler comparison.
  if (pid.protocol === 'standard') return 30;
  if (pid.pid === '2101') return 180;
  return 60;
}

function headerSwitchCostMs(fromRoute, toRoute) {
  if (fromRoute === toRoute) return 0;
  if (!toRoute) return 0;
  // Source: atsh-manager.js command sequence
  // Toyota route switch sends ATSH + ATCRA + ATFCSH + ATFCSD + ATFCSM.
  // Standard reset sends ATSH 7DF (+ optional ATCRA clear).
  if (toRoute.startsWith('toyota:')) return 5 * 30;
  return 2 * 30;
}

function nextDuePid(now, pids, lastPoll) {
  let best = null;
  let bestOverdue = -Infinity;
  for (const pid of pids) {
    const key = pidKey(pid);
    const last = lastPoll.get(key) || 0;
    const overdue = (now - last) - pid.interval;
    if (overdue > 0 && overdue > bestOverdue) {
      bestOverdue = overdue;
      best = pid;
    }
  }
  return best;
}

function nextDuePidOptimized(now, pids, lastPoll, preferredRoute) {
  let best = null;
  let bestOverdue = -Infinity;
  let preferred = null;
  let preferredOverdue = -Infinity;

  for (const pid of pids) {
    const key = pidKey(pid);
    const last = lastPoll.get(key) || 0;
    const overdue = (now - last) - pid.interval;
    if (overdue > 0 && overdue > bestOverdue) {
      bestOverdue = overdue;
      best = pid;
    }
    if (preferredRoute && routeKey(pid) === preferredRoute && overdue > 0 && overdue > preferredOverdue) {
      preferredOverdue = overdue;
      preferred = pid;
    }
  }

  if (preferred && best && (bestOverdue - preferredOverdue) < 400) {
    return preferred;
  }
  return best;
}

function summarize(simName, durationMs, pids, pollCountByPid, headerSwitches) {
  let total = 0;
  const perPid = [];
  for (const pid of pids) {
    const key = pidKey(pid);
    const count = pollCountByPid.get(key) || 0;
    total += count;
    perPid.push({ key, count, hz: count / (durationMs / 1000) });
  }
  perPid.sort((a, b) => a.key.localeCompare(b.key));
  return {
    simName,
    durationSec: durationMs / 1000,
    totalPolls: total,
    avgPollHz: total / (durationMs / 1000),
    headerSwitches,
    perPid,
  };
}

function runLegacy(durationMs, pids) {
  const lastPoll = new Map();
  const pollCountByPid = new Map();
  let now = 0;
  let currentRoute = null;
  let headerSwitches = 0;

  while (now < durationMs) {
    const pid = nextDuePid(now, pids, lastPoll);
    if (!pid) {
      now += 50;
      continue;
    }

    const nextRoute = routeKey(pid);
    const switchCost = headerSwitchCostMs(currentRoute, nextRoute);
    if (switchCost > 0) headerSwitches++;

    now += switchCost + commandDurationMs(pid);
    lastPoll.set(pidKey(pid), now);
    pollCountByPid.set(pidKey(pid), (pollCountByPid.get(pidKey(pid)) || 0) + 1);
    currentRoute = nextRoute;

    // Legacy scheduler always waits 50ms between loop iterations.
    now += 50;
  }

  return summarize('legacy', durationMs, pids, pollCountByPid, headerSwitches);
}

function runOptimized(durationMs, pids) {
  const lastPoll = new Map();
  const pollCountByPid = new Map();
  let now = 0;
  let currentRoute = null;
  let headerSwitches = 0;

  while (now < durationMs) {
    const pid = nextDuePidOptimized(now, pids, lastPoll, currentRoute);
    if (!pid) {
      now += 10;
      continue;
    }

    const nextRoute = routeKey(pid);
    const switchCost = headerSwitchCostMs(currentRoute, nextRoute);
    if (switchCost > 0) headerSwitches++;

    now += switchCost + commandDurationMs(pid);
    lastPoll.set(pidKey(pid), now);
    pollCountByPid.set(pidKey(pid), (pollCountByPid.get(pidKey(pid)) || 0) + 1);
    currentRoute = nextRoute;

    // Optimized loop re-enters immediately when more work is due.
    now += 0;
  }

  return summarize('optimized', durationMs, pids, pollCountByPid, headerSwitches);
}

function compare(a, b) {
  return {
    totalPollsDeltaPct: ((b.totalPolls - a.totalPolls) / Math.max(1, a.totalPolls)) * 100,
    avgPollHzDeltaPct: ((b.avgPollHz - a.avgPollHz) / Math.max(0.0001, a.avgPollHz)) * 100,
    headerSwitchDeltaPct: ((b.headerSwitches - a.headerSwitches) / Math.max(1, a.headerSwitches)) * 100,
  };
}

const durationMs = 60_000;
const { selected } = selectPolledPids(STANDARD_PIDS, TOYOTA_PIDS, { includeAll: false });

const legacy = runLegacy(durationMs, selected);
const optimized = runOptimized(durationMs, selected);

console.log(JSON.stringify({
  baseline: legacy,
  optimized,
  delta: compare(legacy, optimized),
}, null, 2));
