const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const babel = require('@babel/core');

const storage = new Map();
const asyncStorage = {
  async getItem(key) {
    return storage.get(key) ?? null;
  },
  async setItem(key, value) {
    storage.set(key, value);
  },
};

function loadSavedModule() {
  const filename = path.resolve(__dirname, 'savedScenarios.js');
  const { code } = babel.transformFileSync(filename, {
    presets: ['babel-preset-expo'],
    babelrc: false,
    configFile: false,
  });
  const originalLoad = Module._load;
  Module._load = (request, parent, isMain) => {
    if (request === '@react-native-async-storage/async-storage') return asyncStorage;
    if (request === './theme') return { STORAGE_KEYS: { SAVED: 'saved-test-key' } };
    return originalLoad(request, parent, isMain);
  };

  try {
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    loaded._compile(code, filename);
    return loaded.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const {
  SAVED_DATA_VERSION,
  SCENARIO_TYPES,
  addSavedScenario,
  createSavedScenario,
  readSavedScenarios,
} = loadSavedModule();

test.beforeEach(() => storage.clear());

test('saved scenarios use the version 2 metadata/input/result structure', () => {
  const saved = createSavedScenario({
    id: 'example',
    type: SCENARIO_TYPES.HOME_PURCHASE,
    name: ' My Home ',
    createdAt: '2026-07-18T12:00:00.000Z',
    inputs: { price: '400000' },
    results: { monthly: 2500 },
  });

  assert.deepEqual(saved, {
    id: 'example',
    type: 'purchase',
    name: 'My Home',
    createdAt: '2026-07-18T12:00:00.000Z',
    inputs: { price: '400000' },
    results: { monthly: 2500 },
  });
});

test('saved scenarios convert non-finite results to JSON-safe nulls', () => {
  const saved = createSavedScenario({
    type: SCENARIO_TYPES.HOME_REFINANCE,
    results: { breakEven: Infinity, monthlySavings: 0 },
  });

  assert.equal(saved.results.breakEven, null);
  assert.doesNotThrow(() => JSON.stringify(saved));
});

test('legacy flat arrays migrate without losing inputs or results', async () => {
  storage.set(
    'saved-test-key',
    JSON.stringify([
      {
        id: 'legacy',
        type: 'car_payoff',
        name: 'Old Payoff',
        date: '2026-07-17T12:00:00.000Z',
        inputs: { pBalance: '25000' },
        balance: 20000,
        interestSaved: 900,
      },
    ]),
  );

  const scenarios = await readSavedScenarios();
  assert.equal(scenarios.length, 1);
  assert.deepEqual(scenarios[0].inputs, { pBalance: '25000' });
  assert.deepEqual(scenarios[0].results, { balance: 20000, interestSaved: 900 });

  const migrated = JSON.parse(storage.get('saved-test-key'));
  assert.equal(migrated.version, SAVED_DATA_VERSION);
  assert.equal(migrated.scenarios[0].id, 'legacy');
});

test('adding a scenario preserves existing entries and writes the envelope', async () => {
  storage.set('saved-test-key', JSON.stringify([]));

  const added = await addSavedScenario({
    id: 'new',
    type: SCENARIO_TYPES.AUTO_REFINANCE,
    name: 'Truck Refi',
    inputs: { rBalance: '22000' },
    results: { netSavings: 1200 },
  });

  assert.equal(added.id, 'new');
  const stored = JSON.parse(storage.get('saved-test-key'));
  assert.equal(stored.version, SAVED_DATA_VERSION);
  assert.equal(stored.scenarios[0].results.netSavings, 1200);
});
