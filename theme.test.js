const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const babel = require('@babel/core');

function loadAppModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath);
  const { code } = babel.transformFileSync(filename, {
    presets: ['babel-preset-expo'],
    babelrc: false,
    configFile: false,
  });

  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(code, filename);
  return loaded.exports;
}

const { monthlyPI, amortize, amortizeWithPayment, formatInputWithCommas } =
  loadAppModule('theme.js');

function assertClose(actual, expected, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('monthlyPI calculates a standard 30-year fixed payment', () => {
  assertClose(monthlyPI(300000, 6, 30), 1798.65);
});

test('monthlyPI handles a zero-interest loan', () => {
  assert.equal(monthlyPI(120000, 0, 10), 1000);
});

test('amortize pays a standard loan off on schedule', () => {
  const result = amortize(300000, 6, 30);

  assert.equal(result.months, 360);
  assertClose(result.monthlyPayment, 1798.65);
  assert.ok(result.totalInterest > 300000);
  assert.equal(result.schedule.at(-1).balance, 0);
});

test('amortize handles zero interest without adding interest', () => {
  const result = amortize(120000, 0, 10);

  assert.equal(result.months, 120);
  assert.equal(result.totalInterest, 0);
  assert.equal(result.totalPaid, 120000);
});

test('extra monthly principal reduces payoff time and interest', () => {
  const baseline = amortize(300000, 6, 30);
  const accelerated = amortize(300000, 6, 30, 200);

  assert.ok(accelerated.months < baseline.months);
  assert.ok(accelerated.totalInterest < baseline.totalInterest);
});

test('a lump-sum principal reduction shortens payoff at the same payment', () => {
  const baseline = amortize(200000, 6, 20);
  const afterLump = amortizeWithPayment(150000, 6, baseline.monthlyPayment);

  assert.ok(afterLump.months < baseline.months);
  assert.ok(afterLump.totalInterest < baseline.totalInterest);
});

test('amortizeWithPayment detects a payment that cannot reduce principal', () => {
  const result = amortizeWithPayment(100000, 12, 1000);

  assert.equal(result.months, Infinity);
  assert.equal(result.totalInterest, Infinity);
});

test('numeric input formatting preserves decimals and separators', () => {
  assert.equal(formatInputWithCommas('0012345.67'), '12,345.67');
  assert.equal(formatInputWithCommas('12.3.4'), '12.34');
  assert.equal(formatInputWithCommas(''), '');
});
