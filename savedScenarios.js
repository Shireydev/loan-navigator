import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from './theme';

export const SAVED_DATA_VERSION = 2;

export const SCENARIO_TYPES = Object.freeze({
  HOME_PURCHASE: 'purchase',
  MORTGAGE_PAYOFF: 'mortgage_payoff',
  HOME_REFINANCE: 'refinance',
  AUTO_PURCHASE: 'car_purchase',
  AUTO_PAYOFF: 'car_payoff',
  AUTO_REFINANCE: 'car_refinance',
});

const VALID_TYPES = new Set(Object.values(SCENARIO_TYPES));

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toJsonValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJsonValue).filter((item) => item !== undefined);
  if (!isRecord(value)) return undefined;

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, toJsonValue(item)])
      .filter(([, item]) => item !== undefined),
  );
}

export function createSavedScenario({ id, type, name, createdAt, inputs, results }) {
  if (!VALID_TYPES.has(type)) throw new Error(`Unsupported saved scenario type: ${type}`);

  return {
    id: String(id ?? Date.now()),
    type,
    name: typeof name === 'string' && name.trim() ? name.trim() : 'Saved Scenario',
    createdAt: validDate(createdAt ?? new Date()),
    inputs: isRecord(inputs) ? toJsonValue(inputs) : {},
    results: isRecord(results) ? toJsonValue(results) : {},
  };
}

function normalizeSavedScenario(value) {
  if (!isRecord(value) || !VALID_TYPES.has(value.type)) return null;

  if (isRecord(value.results)) {
    return createSavedScenario(value);
  }

  // Version 1 stored calculated values beside metadata. Keep reading those
  // objects and move their remaining fields into the version 2 results bag.
  const { id, type, name, date, createdAt, inputs, ...legacyResults } = value;
  return createSavedScenario({
    id,
    type,
    name,
    createdAt: createdAt ?? date,
    inputs,
    results: legacyResults,
  });
}

function parseSavedPayload(raw) {
  if (!raw) return { scenarios: [], needsMigration: false };

  const parsed = JSON.parse(raw);
  const isCurrent =
    isRecord(parsed) && parsed.version === SAVED_DATA_VERSION && Array.isArray(parsed.scenarios);
  const candidates = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.scenarios)
      ? parsed.scenarios
      : [];

  return {
    scenarios: candidates.map(normalizeSavedScenario).filter(Boolean),
    needsMigration: !isCurrent,
  };
}

export async function writeSavedScenarios(scenarios) {
  const normalized = Array.isArray(scenarios)
    ? scenarios.map(normalizeSavedScenario).filter(Boolean)
    : [];
  await AsyncStorage.setItem(
    STORAGE_KEYS.SAVED,
    JSON.stringify({ version: SAVED_DATA_VERSION, scenarios: normalized }),
  );
  return normalized;
}

export async function readSavedScenarios() {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.SAVED);
  const { scenarios, needsMigration } = parseSavedPayload(raw);

  if (needsMigration && raw) {
    try {
      await writeSavedScenarios(scenarios);
    } catch (error) {
      // Reading legacy data should still succeed if the best-effort migration
      // write is temporarily unavailable.
      console.warn('Unable to migrate saved scenarios:', error);
    }
  }
  return scenarios;
}

export async function addSavedScenario(scenario) {
  const scenarios = await readSavedScenarios();
  const saved = createSavedScenario(scenario);
  await writeSavedScenarios([saved, ...scenarios]);
  return saved;
}
