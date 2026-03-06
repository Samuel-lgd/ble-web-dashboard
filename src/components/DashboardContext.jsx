import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const DashboardCtx = createContext(null);

/**
 * Provides store, tripManager, config, adapter, and elm to the component tree.
 */
export function DashboardProvider({ store, tripManager, adapter, elm, pidManager = null, children }) {
  const config = tripManager.getConfig();
  return (
    <DashboardCtx.Provider value={{ store, tripManager, config, adapter, elm, pidManager }}>
      {children}
    </DashboardCtx.Provider>
  );
}

export function useDashboard() {
  return useContext(DashboardCtx);
}

/**
 * Subscribe to a single PID value. Re-renders only when this PID updates.
 * Store.onChange now returns an unsubscribe function — called in cleanup
 * to prevent listener leaks across component lifecycles.
 */
export function usePid(key) {
  const { store } = useContext(DashboardCtx);
  const [value, setValue] = useState(() => store.get(key)?.value ?? null);

  useEffect(() => {
    const entry = store.get(key);
    if (entry && entry.value !== null) setValue(entry.value);

    const unsub = store.onChange((k, e) => {
      if (k === key) setValue(e.value);
    });
    return unsub;
  }, [store, key]);

  return value;
}

/**
 * Subscribe to the rolling history array for a PID.
 * Throttled to update at most every 500 ms to avoid excessive re-renders.
 */
export function usePidHistory(key) {
  const { store } = useContext(DashboardCtx);
  const [history, setHistory] = useState([]);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const unsub = store.onChange((k) => {
      if (k !== key) return;
      const now = Date.now();
      if (now - lastUpdateRef.current < 500) return;
      lastUpdateRef.current = now;
      const entry = store.get(key);
      if (entry) setHistory([...entry.history]);
    });
    return unsub;
  }, [store, key]);

  return history;
}

/**
 * Poll current trip data every second.
 */
export function useTripData() {
  const { tripManager } = useContext(DashboardCtx);
  const [trip, setTrip] = useState(null);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const current = tripManager.getCurrentTrip();
      if (current) {
        setTrip({
          distanceKm: current.stats?.distanceKm ?? 0,
          durationSeconds: current.stats?.durationSeconds ?? 0,
          fuelConsumedL: current.stats?.fuelConsumedL ?? 0,
          fuelCostEur: current.stats?.fuelCostEur ?? 0,
          avgConsumptionL100km: current.stats?.avgConsumptionL100km ?? 0,
          evModePercent: current.stats?.evModePercent ?? 0,
          regenEnergyWh: current.stats?.regenEnergyWh ?? 0,
        });
      }
      setTimeout(tick, 1000);
    };
    tick();
    return () => { alive = false; };
  }, [tripManager]);

  return trip;
}

/**
 * Subscribe to multiple PIDs at once. Returns an object keyed by PID key.
 * Throttles updates to 60fps via requestAnimationFrame.
 */
export function useMultiPid(keys) {
  const { store } = useContext(DashboardCtx);
  const [values, setValues] = useState(() => {
    const v = {};
    for (const k of keys) v[k] = store.get(k)?.value ?? null;
    return v;
  });
  const pendingRef = useRef(false);
  const latestRef = useRef(values);
  const keysSet = useRef(new Set(keys));

  useEffect(() => {
    keysSet.current = new Set(keys);

    const unsub = store.onChange((k, entry) => {
      if (!keysSet.current.has(k)) return;
      latestRef.current = { ...latestRef.current, [k]: entry.value };
      if (!pendingRef.current) {
        pendingRef.current = true;
        requestAnimationFrame(() => {
          setValues({ ...latestRef.current });
          pendingRef.current = false;
        });
      }
    });
    return unsub;
  }, [store, keys.join(',')]);

  return values;
}
