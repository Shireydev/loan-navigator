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

const { estimatePropertyTax, estimateHomeInsurance, estimateClosingCosts } =
  loadAppModule('costEstimator.js');
const { lookupTaxByZip } = loadAppModule('taxApi.js');

test('county property-tax estimate applies the effective local rate', () => {
  const result = estimatePropertyTax(
    { effectiveRate: 1.25, hasCountyData: true, confidenceLevel: 'High' },
    500000,
  );

  assert.equal(result.annualEstimate, 6250);
  assert.equal(result.ratePct, 1.25);
  assert.equal(result.isCountyEstimate, true);
});

test('insurance estimate uses county observations and a sublinear value adjustment', () => {
  const result = estimateHomeInsurance(
    {
      medianHomeValue: 400000,
      confidenceLevel: 'High',
      insurance: {
        annualEstimate: 2000,
        annualLow: 1500,
        annualHigh: 3000,
        sampleHomes: 800,
      },
    },
    800000,
  );

  assert.equal(result.isCountyEstimate, true);
  assert.ok(result.annualEstimate > 2000);
  assert.ok(result.annualEstimate < 4000);
  assert.ok(result.annualLow < result.annualEstimate);
  assert.ok(result.annualHigh > result.annualEstimate);
});

test('insurance estimate clearly reports a state fallback when county data is absent', () => {
  const result = estimateHomeInsurance({ insBase: 1800 }, 400000);

  assert.equal(result.annualEstimate, 1800);
  assert.equal(result.isCountyEstimate, false);
  assert.equal(result.confidenceLevel, 'Fallback');
});

test('closing-cost estimate prefers county HMDA bands when available', () => {
  const result = estimateClosingCosts(
    {
      closingCosts: {
        purchase: {
          '300to499': { p25: 7000, median: 9000, p75: 12000, sampleLoans: 250 },
        },
      },
      closingCostSource: 'HMDA originated-loan data',
      closingCostSourceYear: 2025,
    },
    { homePrice: 500000, loanAmount: 400000, purpose: 'purchase' },
  );

  assert.equal(result.estimate, 9000);
  assert.equal(result.low, 7000);
  assert.equal(result.high, 12000);
  assert.equal(result.isHmdaEstimate, true);
});

test('refinance closing fallback is lower than the purchase fallback', () => {
  const info = { closingRate: 3, stateCode: 'MI' };
  const purchase = estimateClosingCosts(info, {
    homePrice: 400000,
    loanAmount: 320000,
    purpose: 'purchase',
  });
  const refinance = estimateClosingCosts(info, { loanAmount: 320000, purpose: 'refinance' });

  assert.ok(refinance.estimate < purchase.estimate);
  assert.equal(refinance.isHmdaEstimate, false);
});

test('ZIP lookup preserves the Worker county insurance and HMDA records', async (context) => {
  const previousFetch = global.fetch;
  context.after(() => {
    global.fetch = previousFetch;
  });
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        city: 'Example City',
        state: 'MI',
        countyFips: '26163',
        taxDataAvailable: true,
        costDataAvailable: true,
        costData: {
          county: 'Wayne County',
          effectiveTaxRate: 0.0185,
          medianHomeValue: 225000,
          insurance: {
            annualEstimate: 2100,
            annualLow: 1400,
            annualHigh: 3000,
            sampleHomes: 1200,
          },
          closingCosts: {
            purchase: {
              '150to299': { p25: 4500, median: 6000, p75: 8000, sampleLoans: 200 },
            },
          },
          source: 'U.S. Census ACS 5-Year Estimates',
          sourceYear: 2024,
          confidenceLevel: 'High',
          engineVersion: 'acs2024-v2',
          closingCostSource: 'FFIEC/CFPB HMDA originated-loan data',
          closingCostSourceYear: 2025,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  const result = await lookupTaxByZip('48201');

  assert.ok(Math.abs(result.effectiveRate - 1.85) < 0.000001);
  assert.equal(result.insurance.annualEstimate, 2100);
  assert.equal(result.closingCosts.purchase['150to299'].median, 6000);
  assert.equal(result.closingCostSourceYear, 2025);
});
