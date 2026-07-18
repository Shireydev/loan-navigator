// taxApi.js
// Location-aware property tax, insurance, and closing-cost estimates.
//
// Property tax data is retrieved from the Loan Navigator Cloudflare Worker.
// The Worker resolves the ZIP code through HUD, identifies the county FIPS,
// and reads the county tax record from Cloudflare KV.
//
// State tables remain available as fallbacks for temporary API or network
// failures and for insurance and closing-cost estimates.

// Effective state-level property-tax rate.
// Values are percentages of home value.
// Example: 1.53 means 1.53%.
export const STATE_TAX_RATE = {
  AL: 0.41,
  AK: 1.19,
  AZ: 0.62,
  AR: 0.62,
  CA: 0.75,
  CO: 0.51,
  CT: 2.14,
  DE: 0.57,
  FL: 0.86,
  GA: 0.9,
  HI: 0.28,
  ID: 0.63,
  IL: 2.23,
  IN: 0.84,
  IA: 1.53,
  KS: 1.41,
  KY: 0.86,
  LA: 0.55,
  ME: 1.28,
  MD: 1.06,
  MA: 1.17,
  MI: 1.38,
  MN: 1.11,
  MS: 0.79,
  MO: 0.97,
  MT: 0.83,
  NE: 1.63,
  NV: 0.55,
  NH: 2.09,
  NJ: 2.47,
  NM: 0.78,
  NY: 1.72,
  NC: 0.82,
  ND: 0.98,
  OH: 1.53,
  OK: 0.9,
  OR: 0.93,
  PA: 1.53,
  RI: 1.53,
  SC: 0.57,
  SD: 1.17,
  TN: 0.66,
  TX: 1.68,
  UT: 0.58,
  VT: 1.9,
  VA: 0.82,
  WA: 0.94,
  WV: 0.58,
  WI: 1.73,
  WY: 0.61,
  DC: 0.57,
};

// Standard statewide sales/use tax rates as of January 1, 2026.
// These are intentionally presented as a starting estimate for auto purchases:
// vehicle-specific rates, local taxes, caps, title fees, and excise taxes can differ.
export const STATE_BASE_SALES_TAX_RATE = {
  AL: 4,
  AK: 0,
  AZ: 5.6,
  AR: 6.5,
  CA: 7.25,
  CO: 2.9,
  CT: 6.35,
  DE: 0,
  FL: 6,
  GA: 4,
  HI: 4,
  ID: 6,
  IL: 6.25,
  IN: 7,
  IA: 6,
  KS: 6.5,
  KY: 6,
  LA: 5,
  ME: 5.5,
  MD: 6,
  MA: 6.25,
  MI: 6,
  MN: 6.875,
  MS: 7,
  MO: 4.225,
  MT: 0,
  NE: 5.5,
  NV: 6.85,
  NH: 0,
  NJ: 6.625,
  NM: 4.875,
  NY: 4,
  NC: 4.75,
  ND: 5,
  OH: 5.75,
  OK: 4.5,
  OR: 0,
  PA: 6,
  RI: 7,
  SC: 6,
  SD: 4.2,
  TN: 7,
  TX: 6.25,
  UT: 4.85,
  VT: 6,
  VA: 4.3,
  WA: 6.5,
  WV: 6,
  WI: 5,
  WY: 4,
  DC: 6,
};

export function getStateBaseSalesTaxRate(stateCode) {
  const code = String(stateCode || '')
    .trim()
    .toUpperCase();
  const rate = STATE_BASE_SALES_TAX_RATE[code];
  return Number.isFinite(rate) ? rate : null;
}

// State-level home insurance base premium in dollars per year.
export const STATE_INS_BASE = {
  AL: 1900,
  AK: 1000,
  AZ: 1400,
  AR: 2200,
  CA: 1300,
  CO: 2500,
  CT: 1500,
  DE: 900,
  FL: 3600,
  GA: 1700,
  HI: 1100,
  ID: 1000,
  IL: 1500,
  IN: 1300,
  IA: 1500,
  KS: 2500,
  KY: 1800,
  LA: 3000,
  ME: 1000,
  MD: 1300,
  MA: 1500,
  MI: 1300,
  MN: 1900,
  MS: 2400,
  MO: 1900,
  MT: 1800,
  NE: 2800,
  NV: 1000,
  NH: 1000,
  NJ: 1000,
  NM: 1600,
  NY: 1400,
  NC: 1600,
  ND: 1800,
  OH: 1200,
  OK: 3600,
  OR: 800,
  PA: 1000,
  RI: 1600,
  SC: 1800,
  SD: 2400,
  TN: 1800,
  TX: 2800,
  UT: 900,
  VT: 900,
  VA: 1300,
  WA: 1000,
  WV: 1200,
  WI: 1000,
  WY: 1500,
  DC: 1300,
};

// Approximate closing-cost rate as a percentage of home price.
export const STATE_CLOSING_RATE = {
  AL: 2.4,
  AK: 2.6,
  AZ: 2.6,
  AR: 2.5,
  CA: 2.9,
  CO: 2.7,
  CT: 3.4,
  DE: 4.5,
  FL: 3.0,
  GA: 2.5,
  HI: 3.0,
  ID: 2.5,
  IL: 3.1,
  IN: 2.4,
  IA: 2.4,
  KS: 2.4,
  KY: 2.6,
  LA: 2.7,
  ME: 3.0,
  MD: 3.8,
  MA: 3.1,
  MI: 2.6,
  MN: 2.6,
  MS: 2.5,
  MO: 2.3,
  MT: 2.5,
  NE: 2.4,
  NV: 3.0,
  NH: 3.1,
  NJ: 3.2,
  NM: 2.6,
  NY: 4.3,
  NC: 2.5,
  ND: 2.5,
  OH: 2.6,
  OK: 2.5,
  OR: 2.6,
  PA: 3.6,
  RI: 3.2,
  SC: 2.6,
  SD: 2.4,
  TN: 2.6,
  TX: 2.7,
  UT: 2.6,
  VT: 3.0,
  VA: 2.9,
  WA: 2.9,
  WV: 2.7,
  WI: 2.5,
  WY: 2.4,
  DC: 4.0,
};

const TAX_API_URL = 'https://loan-navigator-tax-api.loannavigation.workers.dev/';

async function getFallbackLocation(zip) {
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const place = data?.places?.[0];

    if (!place) {
      return null;
    }

    return {
      city: place['place name'] || '',
      state: place.state || '',
      stateCode: place['state abbreviation'] || '',
    };
  } catch {
    return null;
  }
}

/**
 * Resolves a ZIP code through the Loan Navigator tax API.
 *
 * The returned tax rate fields use percentage values for compatibility with
 * the existing app.
 *
 * Example:
 * 0.82 means 0.82%.
 */
export async function lookupTaxByZip(zip) {
  const clean = String(zip ?? '').replace(/\D/g, '');

  if (clean.length !== 5) {
    throw new Error('Enter a valid 5-digit ZIP code.');
  }

  let apiData = null;

  try {
    const requestUrl = `${TAX_API_URL}?zip=${encodeURIComponent(clean)}`;

    const response = await fetch(requestUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    apiData = await response.json().catch(() => null);

    const workerRate = Number(apiData?.taxData?.effectiveTaxRate);

    if (
      response.ok &&
      apiData?.taxDataAvailable === true &&
      Number.isFinite(workerRate) &&
      workerRate > 0
    ) {
      const stateCode = String(apiData.state || '').toUpperCase();

      /*
       * The Worker stores the tax rate as a decimal.
       *
       * Worker:
       * 0.0082 = 0.82%
       *
       * Existing app:
       * 0.82 = 0.82%
       */
      const effectiveRate = workerRate * 100;

      const county = apiData.taxData.county || apiData.county || '';

      const city = apiData.city || '';

      return {
        place: [city, stateCode].filter(Boolean).join(', '),

        city,
        county,
        countyDisplay: county,
        countyFips: apiData.countyFips || '',

        state: stateCode,
        stateCode,

        stateRate: STATE_TAX_RATE[stateCode] ?? effectiveRate,

        countyRate: effectiveRate,
        localRate: effectiveRate,
        effectiveRate,

        hasCountyData: true,
        localAdjPct: 0,

        insBase: STATE_INS_BASE[stateCode] ?? null,

        closingRate: STATE_CLOSING_RATE[stateCode] ?? 3.0,

        source: apiData.taxData.source || 'Loan Navigator Tax API',

        sourceYear: apiData.taxData.sourceYear ?? null,

        confidenceLevel: apiData.taxData.confidenceLevel || 'Baseline',

        engineVersion: apiData.taxData.engineVersion || null,

        medianTaxBill: apiData.taxData.medianTaxBill ?? null,

        medianHomeValue: apiData.taxData.medianHomeValue ?? null,
      };
    }
  } catch (error) {
    console.warn('Loan Navigator tax API request failed:', error);
  }

  /*
   * Safe fallback:
   *
   * If the Worker is temporarily unavailable, retrieve the location through
   * Zippopotam.us and use the existing state-average property tax rate.
   */
  let city = apiData?.city || '';
  let stateCode = String(apiData?.state || '').toUpperCase();
  let state = stateCode;

  if (!stateCode) {
    const fallbackLocation = await getFallbackLocation(clean);

    if (fallbackLocation) {
      city = fallbackLocation.city;
      state = fallbackLocation.state;
      stateCode = fallbackLocation.stateCode;
    }
  }

  if (!stateCode) {
    throw new Error('Unable to retrieve tax information for this ZIP code.');
  }

  const fallbackRate = STATE_TAX_RATE[stateCode] ?? 1.1;

  return {
    place: [city, stateCode].filter(Boolean).join(', '),

    city,
    county: '',
    countyDisplay: '',
    countyFips: apiData?.countyFips || '',

    state,
    stateCode,

    stateRate: fallbackRate,
    countyRate: fallbackRate,
    localRate: fallbackRate,
    effectiveRate: fallbackRate,

    hasCountyData: false,
    localAdjPct: 0,

    insBase: STATE_INS_BASE[stateCode] ?? null,

    closingRate: STATE_CLOSING_RATE[stateCode] ?? 3.0,

    source: 'State-average fallback',
    sourceYear: null,
    confidenceLevel: 'Fallback',
    engineVersion: null,
    medianTaxBill: null,
    medianHomeValue: null,
  };
}
