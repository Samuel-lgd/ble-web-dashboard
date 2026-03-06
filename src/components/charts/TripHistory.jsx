import React, { useState, useEffect, useCallback } from 'react';
import { useDashboard } from '../DashboardContext';

// ── Tag config ─────────────────────────────────────────
const TAGS = {
  highway:       { label: 'Autoroute', bg: '#1e3a5f', text: '#93c5fd' },
  city:          { label: 'Ville',     bg: '#451a03', text: '#fcd34d' },
  'cold-start':  { label: 'Démarrage froid', bg: '#0c3040', text: '#67e8f9' },
  'ev-dominant': { label: 'EV+',       bg: '#052e16', text: '#4ade80' },
  aggressive:    { label: 'Agressif',  bg: '#450a0a', text: '#f87171' },
  'long-trip':   { label: 'Long',      bg: '#2e1065', text: '#c4b5fd' },
  'short-trip':  { label: 'Court',     bg: '#1c1c24', text: '#9ca3af' },
  idling:        { label: 'Ralenti',   bg: '#422006', text: '#fbbf24' },
};

const DAY_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function fmtDuration(secs) {
  if (!secs) return '0 min';
  const m = Math.floor(secs / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
  }
  return `${m} min`;
}

function fmtDate(isoString) {
  const d = new Date(isoString);
  return {
    weekday: DAY_FR[d.getDay()],
    date: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
    time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  };
}

// ── Sub-components ─────────────────────────────────────

/** Big number KPI block */
function Metric({ value, label, color = '#f1f5f9', sub }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <span className="text-[15px] font-bold leading-none tabular-nums font-orbitron"
        style={{ color }}>
        {value}
      </span>
      {sub && (
        <span className="text-[9px] font-medium leading-none" style={{ color, opacity: 0.5 }}>
          {sub}
        </span>
      )}
      <span className="text-[9px] text-gray-500 leading-none mt-0.5">{label}</span>
    </div>
  );
}

function MetricDivider() {
  return <div className="w-px self-stretch bg-gray-800 mx-1 flex-shrink-0" />;
}

/** Two-column stat line for expanded view */
function StatLine({ icon, label, value, color = '#d1d5db' }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-800/50 last:border-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon && <span className="text-[11px] flex-shrink-0 opacity-60">{icon}</span>}
        <span className="text-[11px] text-gray-400 leading-none">{label}</span>
      </div>
      <span className="text-[12px] font-semibold tabular-nums flex-shrink-0" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

/** Colored pill tag */
function Tag({ id }) {
  const cfg = TAGS[id] ?? { label: id, bg: '#1c1c24', text: '#9ca3af' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium leading-none"
      style={{ background: cfg.bg, color: cfg.text }}>
      {cfg.label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────

export default function TripHistory({ onBack }) {
  const { tripManager, config } = useDashboard();
  const [trips, setTrips] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [fuelPrice, setFuelPrice] = useState(config.get('fuelPricePerLiter'));

  const refresh = useCallback(
    () => tripManager.getTrips().then(setTrips),
    [tripManager],
  );

  useEffect(() => { refresh(); }, [refresh]);

  const handleExport = async (id, format, e) => {
    e.stopPropagation();
    try { await tripManager.exportTrip(id, format); }
    catch (err) { console.error('Export failed:', err); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    await tripManager.deleteTrip(id);
    if (expanded === id) setExpanded(null);
    refresh();
  };

  const handleSavePrice = () => {
    config.set('fuelPricePerLiter', parseFloat(fuelPrice) || 1.85);
    setShowSettings(false);
  };

  // Group trips by calendar day
  const grouped = [];
  let currentDay = null;
  for (const trip of trips) {
    const dayKey = trip.startTime.slice(0, 10);
    if (dayKey !== currentDay) {
      currentDay = dayKey;
      grouped.push({ type: 'header', dayKey });
    }
    grouped.push({ type: 'trip', trip });
  }

  return (
    <div className="h-full w-full flex flex-col" style={{ background: '#0d0d14', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Topbar ── */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid #1a1a24' }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="cluster-back-btn flex-shrink-0 font-orbitron">
            ◀ DASH
          </button>
          <div>
            <div className="text-sm font-semibold text-gray-100 leading-none">Mes trajets</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {trips.length} trajet{trips.length !== 1 ? 's' : ''} enregistré{trips.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
          style={{
            background: showSettings ? '#2a1a00' : '#1a1a24',
            border: `1px solid ${showSettings ? '#92400e' : '#2a2a38'}`,
            color: showSettings ? '#fbbf24' : '#6b7280',
          }}>
          <span>⚙</span>
          <span>Prix carburant</span>
        </button>
      </div>

      {/* ── Settings drawer ── */}
      {showSettings && (
        <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ background: '#111118', borderBottom: '1px solid #1a1a24' }}>
          <span className="text-xs text-gray-400">Prix au litre (€)</span>
          <input
            type="number" step="0.01" min="0"
            value={fuelPrice}
            onChange={e => setFuelPrice(e.target.value)}
            className="w-20 rounded-lg px-2.5 py-1 text-sm text-gray-100 outline-none"
            style={{ background: '#0d0d14', border: '1px solid #2a2a38' }}
          />
          <button onClick={handleSavePrice}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{ background: '#92400e', color: '#fef3c7' }}>
            Enregistrer
          </button>
        </div>
      )}

      {/* ── List ── */}
      <div className="flex-1 overflow-auto trip-scroll px-3 pt-2 pb-6">

        {trips.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-20 gap-4 opacity-40">
            <span className="text-4xl">🚗</span>
            <p className="text-sm text-gray-500 text-center">
              Aucun trajet enregistré.<br />Connectez-vous au véhicule pour commencer.
            </p>
          </div>
        )}

        {grouped.map((item) => {
          /* ── Day separator ── */
          if (item.type === 'header') {
            const d = new Date(item.dayKey);
            const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            return (
              <div key={`h-${item.dayKey}`} className="flex items-center gap-3 mt-4 mb-2">
                <span className="text-xs font-semibold text-gray-500 capitalize whitespace-nowrap">
                  {label}
                </span>
                <div className="flex-1 h-px" style={{ background: '#1e1e2c' }} />
              </div>
            );
          }

          /* ── Trip card ── */
          const { trip } = item;
          const s = trip.stats || {};
          const isExpanded = expanded === trip.id;
          const { weekday, date, time } = fmtDate(trip.startTime);
          const isInterrupted = trip.status === 'interrupted';
          const evPct = Math.min(100, Math.max(0, s.evModePercent ?? 0));
          const startLoc = s.startLocation ?? null;
          const endLoc   = s.endLocation   ?? null;
          const hasLocations = startLoc || endLoc;
          const tags = trip.meta?.tags ?? [];

          return (
            <div key={trip.id}
              className="mb-2 rounded-xl overflow-hidden transition-all"
              style={{
                background: '#111118',
                border: `1px solid ${isExpanded ? '#2a2a3c' : '#1c1c28'}`,
              }}>

              {/* ── Route header: Départ → [Metrics] → Arrivée ── */}
              <div className="cursor-pointer" onClick={() => setExpanded(isExpanded ? null : trip.id)}>
                {hasLocations ? (
                  <div className="flex items-stretch"
                    style={{ borderBottom: '1px solid #1a1a24' }}>

                    {/* Departure */}
                    <div className="flex-1 flex flex-col justify-center px-3 py-2.5 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span style={{ color: '#4ade80', fontSize: 10 }}>●</span>
                        <span className="text-[10px] font-medium uppercase tracking-wide"
                          style={{ color: '#4ade80', opacity: 0.7 }}>Départ</span>
                      </div>
                      <span className="text-[13px] font-semibold text-gray-100 leading-tight truncate">
                        {startLoc?.city ?? '—'}
                      </span>
                      {startLoc?.suburb && (
                        <span className="text-[10px] text-gray-500 leading-none mt-0.5 truncate">
                          {startLoc.suburb}
                        </span>
                      )}
                    </div>

                    {/* Center: 2x2 grid of metrics */}
                    <div className="flex flex-col items-center justify-center px-2 py-2 flex-shrink-0"
                      style={{ borderLeft: '1px solid #1a1a24', borderRight: '1px solid #1a1a24', minWidth: '180px' }}>
                      {/* Top row */}
                      <div className="flex gap-3 items-center justify-center">
                        <div className="flex flex-col items-center gap-0">
                          <span className="text-[9px] font-semibold text-gray-300 tabular-nums">{fmtDuration(s.durationSeconds)}</span>
                          <span className="text-[8px] text-gray-500 leading-none">Durée</span>
                        </div>
                        <div className="w-px h-6 bg-gray-800" />
                        <div className="flex flex-col items-center gap-0">
                          <span className="text-[9px] font-semibold text-amber-400 tabular-nums">{(s.avgConsumptionL100km ?? 0).toFixed(1)}</span>
                          <span className="text-[8px] text-gray-500 leading-none">L/100</span>
                        </div>
                      </div>
                      
                      {/* Divider */}
                      <div className="w-full h-px bg-gray-800 my-1" />
                      
                      {/* Bottom row */}
                      <div className="flex gap-3 items-center justify-center">
                        <div className="flex flex-col items-center gap-0">
                          <span className="text-[9px] font-semibold text-yellow-400 tabular-nums">€ {(s.fuelCostEur ?? 0).toFixed(2)}</span>
                          <span className="text-[8px] text-gray-500 leading-none">Coût</span>
                        </div>
                        <div className="w-px h-6 bg-gray-800" />
                        <div className="flex flex-col items-center gap-0">
                          <span className="text-[9px] font-semibold text-gray-200 tabular-nums">{(s.maxSpeedKmh ?? 0).toFixed(0)}</span>
                          <span className="text-[8px] text-gray-500 leading-none">km/h</span>
                        </div>
                      </div>

                      {/* Chevron below */}
                      <span className="text-gray-700 text-[8px] mt-1.5 opacity-50">
                        {isExpanded ? '▾' : '▸'}
                      </span>
                    </div>

                    {/* Arrival */}
                    <div className="flex-1 flex flex-col justify-center items-end px-3 py-2.5 min-w-0 text-right">
                      <div className="flex items-center justify-end gap-1.5 mb-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide"
                          style={{ color: '#f87171', opacity: 0.7 }}>Arrivée</span>
                        <span style={{ color: '#f87171', fontSize: 10 }}>●</span>
                      </div>
                      <span className="text-[13px] font-semibold text-gray-100 leading-tight truncate">
                        {endLoc?.city ?? '—'}
                      </span>
                      {endLoc?.suburb && (
                        <span className="text-[10px] text-gray-500 leading-none mt-0.5 truncate">
                          {endLoc.suburb}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Fallback header when no GPS data */
                  <div className="flex items-center justify-between px-3 pt-3 pb-2.5"
                    style={{ borderBottom: '1px solid #1a1a24' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-gray-200">{weekday} {date}</span>
                      <span className="text-[11px] text-gray-500">{time}</span>
                      {isInterrupted && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{ background: '#2a1700', color: '#fb923c', border: '1px solid #431a00' }}>
                          interrompu
                        </span>
                      )}
                    </div>
                    <span className="text-gray-600 text-sm flex-shrink-0 ml-2">
                      {isExpanded ? '▾' : '▸'}
                    </span>
                  </div>
                )}

                {/* Sub-header: date + distance + badges (always visible when route shown) */}
                {hasLocations && (
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-gray-500 capitalize">{weekday} {date}</span>
                      {isInterrupted && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{ background: '#2a1700', color: '#fb923c', border: '1px solid #431a00' }}>
                          interrompu
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] font-semibold text-gray-400">{(s.distanceKm ?? 0).toFixed(1)} km</span>
                  </div>
                )}

                {/* EV bar + regen (no separate metrics bar anymore) */}
                <div className="mx-3 mt-2 mb-2 flex items-center gap-1.5 min-w-0">
                  <div className="flex-1 h-[5px] rounded-full overflow-hidden"
                    style={{ background: '#1a1a28' }}>
                    <div className="h-full rounded-full"
                      style={{
                        width: `${evPct}%`,
                        background: 'linear-gradient(to right, #0284c7, #22d3ee)',
                      }} />
                  </div>
                  <span className="text-[10px] font-medium text-sky-400 flex-shrink-0">
                    {Math.round(evPct)}% EV
                  </span>
                  <span className="text-[10px] text-emerald-500 flex-shrink-0">
                    ↺ {Math.round(s.regenEnergyWh ?? 0)} Wh
                  </span>
                </div>

                {/* Tags */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mx-3 mb-2.5">
                    {tags.map(tag => <Tag key={tag} id={tag} />)}
                  </div>
                )}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-3 pb-3" style={{ borderTop: '1px solid #1a1a28' }}>

                  {/* Stats grid: 2 columns */}
                  <div className="grid grid-cols-2 gap-x-4 mt-2">
                    <div>
                      <StatLine icon="🏎" label="Vitesse moy."   value={`${(s.avgSpeedKmh ?? 0).toFixed(0)} km/h`} />
                      <StatLine icon="⚡" label="Vitesse max."   value={`${(s.maxSpeedKmh ?? 0).toFixed(0)} km/h`} />
                      <StatLine icon="🔄" label="RPM max."       value={Math.round(s.maxRpm ?? 0).toLocaleString('fr')} />
                      <StatLine icon="⛽" label="Carburant"      value={`${(s.fuelConsumedL ?? 0).toFixed(2)} L`} color="#fb923c" />
                      <StatLine icon="📊" label="Moteur actif"  value={`${(s.engineOnPercent ?? 0).toFixed(0)}%`} />
                      <StatLine icon="😴" label="Ralenti pur"   value={`${Math.floor((s.idleTimeSeconds ?? 0) / 60)} min`} />
                    </div>
                    <div>
                      <StatLine icon="🔋" label="Mode EV"       value={`${(s.evModePercent ?? 0).toFixed(0)}%`} color="#22d3ee" />
                      <StatLine icon="↕" label="SOC Δ"
                        value={`${(s.socDelta ?? 0) >= 0 ? '+' : ''}${(s.socDelta ?? 0).toFixed(1)}%`}
                        color={(s.socDelta ?? 0) >= 0 ? '#4ade80' : '#fb923c'} />
                      <StatLine icon="♻" label="Récupéré"      value={`${Math.round(s.regenEnergyWh ?? 0)} Wh`} color="#4ade80" />
                      <StatLine icon="🌫" label="CO₂ émis"      value={`${Math.round(s.co2EmittedGrams ?? 0)} g`} />
                      <StatLine icon="🌿" label="CO₂ économisé" value={`${Math.round(s.savedCo2Grams ?? 0)} g`} color="#4ade80" />
                      <StatLine icon="🌡" label="Réf. temp."    value={`${(s.avgCoolantTemp ?? 0).toFixed(0)} °C`} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-3 pt-2"
                    style={{ borderTop: '1px solid #1a1a28' }}>
                    <div className="flex gap-1.5">
                      {['GPX', 'CSV', 'JSON'].map(fmt => (
                        <button key={fmt}
                          onClick={e => handleExport(trip.id, fmt.toLowerCase(), e)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: '#1a1a28', border: '1px solid #2a2a3c', color: '#9ca3af' }}>
                          {fmt}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={e => handleDelete(trip.id, e)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: '#1a0a0a', border: '1px solid #3a1212', color: '#f87171' }}>
                      Supprimer
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
