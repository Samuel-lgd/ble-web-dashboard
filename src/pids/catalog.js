import { STANDARD_PIDS } from './definitions/standard.js';
import { TOYOTA_PIDS } from './definitions/toyota.js';

/**
 * Build the canonical store key for a PID definition.
 * Format: protocol:header:pid:name
 * Standard PIDs have an empty header segment.
 * @param {import('./definitions/standard.js').PIDDefinition} pid
 * @returns {string}
 */
export function pidKeyFromDefinition(pid) {
  return `${pid.protocol}:${pid.header || ''}:${pid.pid}:${pid.name}`;
}

/**
 * Parse a PID key into display-friendly parts.
 * @param {string} key
 * @returns {{ protocol: string, header: string, pid: string, name: string }}
 */
export function parsePidKey(key) {
  const [protocol = '', header = '', pid = '', ...nameParts] = String(key || '').split(':');
  return {
    protocol,
    header,
    pid,
    name: nameParts.join(':'),
  };
}

const AVAILABLE_PID_ENTRIES = [...STANDARD_PIDS, ...TOYOTA_PIDS].map((definition) => ({
  key: pidKeyFromDefinition(definition),
  definition,
  protocol: definition.protocol,
  header: definition.header || '',
  pid: definition.pid,
  name: definition.name,
  unit: definition.unit,
  interval: definition.interval,
}));

const AVAILABLE_PID_MAP = new Map(AVAILABLE_PID_ENTRIES.map((entry) => [entry.key, entry]));

export function getAllAvailablePidEntries() {
  return [...AVAILABLE_PID_ENTRIES];
}

export function getPidEntryByKey(key) {
  return AVAILABLE_PID_MAP.get(key) || null;
}

export function getPidDefinitionByKey(key) {
  return AVAILABLE_PID_MAP.get(key)?.definition || null;
}

/**
 * Build a merged catalog for requested keys, including missing definitions.
 * @param {string[]} requestedKeys
 * @returns {{ entries: Array<object>, missingKeys: string[] }}
 */
export function buildPidCatalog(requestedKeys) {
  const uniqueRequested = [...new Set(requestedKeys || [])];
  const entries = [];
  const missingKeys = [];

  for (const key of uniqueRequested) {
    const entry = AVAILABLE_PID_MAP.get(key);
    if (entry) {
      entries.push({ ...entry, available: true });
      continue;
    }

    const parsed = parsePidKey(key);
    entries.push({
      ...parsed,
      key,
      unit: '',
      interval: null,
      definition: null,
      available: false,
    });
    missingKeys.push(key);
  }

  return { entries, missingKeys };
}
