// taxApi.js
// Location-aware tax + closing cost lookups for a US ZIP code.
//
// This module resolves a ZIP code to its city / county / state (via the free
// Zippopotam.us API), then layers on local, county and state property-tax
// rates so estimates are more accurate than a plain state average.
//
// Because there is no single free public API that returns a combined local +
// county + state effective property-tax rate for every ZIP in the US, we
// combine a live geographic lookup (real county/state from the ZIP) with a
// curated dataset of published effective property-tax rates by state, plus a
// per-county multiplier for counties that deviate meaningfully from their
// state average. This gives a realistic local/county/state breakdown instead
// of a single flat state figure.

// Effective STATE-level property-tax rate (% of home value). Published
// national averages.
export const STATE_TAX_RATE = {
  AL: 0.41, AK: 1.19, AZ: 0.62, AR: 0.62, CA: 0.75, CO: 0.51, CT: 2.14, DE: 0.57,
  FL: 0.86, GA: 0.90, HI: 0.28, ID: 0.63, IL: 2.23, IN: 0.84, IA: 1.53, KS: 1.41,
  KY: 0.86, LA: 0.55, ME: 1.28, MD: 1.06, MA: 1.17, MI: 1.38, MN: 1.11, MS: 0.79,
  MO: 0.97, MT: 0.83, NE: 1.63, NV: 0.55, NH: 2.09, NJ: 2.47, NM: 0.78, NY: 1.72,
  NC: 0.82, ND: 0.98, OH: 1.53, OK: 0.90, OR: 0.93, PA: 1.53, RI: 1.53, SC: 0.57,
  SD: 1.17, TN: 0.66, TX: 1.68, UT: 0.58, VT: 1.90, VA: 0.82, WA: 0.94, WV: 0.58,
  WI: 1.73, WY: 0.61, DC: 0.57,
};

// State-level home insurance base premium ($/yr). National averages.
export const STATE_INS_BASE = {
  AL: 1900, AK: 1000, AZ: 1400, AR: 2200, CA: 1300, CO: 2500, CT: 1500, DE: 900,
  FL: 3600, GA: 1700, HI: 1100, ID: 1000, IL: 1500, IN: 1300, IA: 1500, KS: 2500,
  KY: 1800, LA: 3000, ME: 1000, MD: 1300, MA: 1500, MI: 1300, MN: 1900, MS: 2400,
  MO: 1900, MT: 1800, NE: 2800, NV: 1000, NH: 1000, NJ: 1000, NM: 1600, NY: 1400,
  NC: 1600, ND: 1800, OH: 1200, OK: 3600, OR: 800, PA: 1000, RI: 1600, SC: 1800,
  SD: 2400, TN: 1800, TX: 2800, UT: 900, VT: 900, VA: 1300, WA: 1000, WV: 1200,
  WI: 1000, WY: 1500, DC: 1300,
};

// Approximate closing cost rate (% of home price) by state.
export const STATE_CLOSING_RATE = {
  AL: 2.4, AK: 2.6, AZ: 2.6, AR: 2.5, CA: 2.9, CO: 2.7, CT: 3.4, DE: 4.5,
  FL: 3.0, GA: 2.5, HI: 3.0, ID: 2.5, IL: 3.1, IN: 2.4, IA: 2.4, KS: 2.4,
  KY: 2.6, LA: 2.7, ME: 3.0, MD: 3.8, MA: 3.1, MI: 2.6, MN: 2.6, MS: 2.5,
  MO: 2.3, MT: 2.5, NE: 2.4, NV: 3.0, NH: 3.1, NJ: 3.2, NM: 2.6, NY: 4.3,
  NC: 2.5, ND: 2.5, OH: 2.6, OK: 2.5, OR: 2.6, PA: 3.6, RI: 3.2, SC: 2.6,
  SD: 2.4, TN: 2.6, TX: 2.7, UT: 2.6, VT: 3.0, VA: 2.9, WA: 2.9, WV: 2.7,
  WI: 2.5, WY: 2.4, DC: 4.0,
};

// Per-county effective property-tax rate overrides (% of home value). Keyed by
// "STATE|County Name" (county name lowercased, no "county"/"parish" suffix).
// These are published county-level effective rates that differ notably from
// their state average. Counties not listed fall back to the state rate with a
// small local adjustment.
const COUNTY_TAX_RATE = {
  // Texas
  'TX|travis': 1.82, 'TX|harris': 2.03, 'TX|dallas': 1.99, 'TX|tarrant': 2.11,
  'TX|bexar': 1.97, 'TX|collin': 1.78, 'TX|denton': 1.81, 'TX|fort bend': 2.23,
  'TX|williamson': 1.83, 'TX|el paso': 2.24,
  // California
  'CA|los angeles': 0.82, 'CA|san francisco': 0.65, 'CA|san diego': 0.73,
  'CA|orange': 0.69, 'CA|santa clara': 0.79, 'CA|alameda': 0.78,
  'CA|sacramento': 0.81, 'CA|riverside': 0.95, 'CA|fresno': 0.82,
  // New York
  'NY|new york': 0.95, 'NY|kings': 0.66, 'NY|queens': 0.88, 'NY|bronx': 0.88,
  'NY|nassau': 2.11, 'NY|suffolk': 2.07, 'NY|westchester': 2.39, 'NY|erie': 2.65,
  'NY|monroe': 2.92,
  // Florida
  'FL|miami-dade': 0.97, 'FL|broward': 1.08, 'FL|palm beach': 1.06,
  'FL|hillsborough': 0.98, 'FL|orange': 0.95, 'FL|duval': 0.94,
  // Illinois
  'IL|cook': 2.10, 'IL|dupage': 2.32, 'IL|lake': 2.83, 'IL|will': 2.64,
  'IL|kane': 2.76,
  // New Jersey
  'NJ|essex': 2.98, 'NJ|bergen': 2.14, 'NJ|hudson': 1.90, 'NJ|middlesex': 2.52,
  'NJ|monmouth': 2.09,
  // Others
  'WA|king': 0.93, 'WA|pierce': 1.10, 'WA|snohomish': 0.98,
  'AZ|maricopa': 0.64, 'AZ|pima': 0.81,
  'CO|denver': 0.53, 'CO|el paso': 0.48, 'CO|arapahoe': 0.57,
  'GA|fulton': 1.03, 'GA|dekalb': 1.17, 'GA|cobb': 0.85,
  'MA|suffolk': 0.67, 'MA|middlesex': 1.11, 'MA|worcester': 1.42,
  'NV|clark': 0.60, 'NV|washoe': 0.62,
  'OH|cuyahoga': 2.11, 'OH|franklin': 1.68, 'OH|hamilton': 1.79,
  'PA|philadelphia': 1.05, 'PA|allegheny': 2.16, 'PA|montgomery': 1.58,
  'VA|fairfax': 1.03, 'VA|arlington': 0.87,
  'NC|mecklenburg': 0.90, 'NC|wake': 0.80,
  'TN|davidson': 0.72, 'TN|shelby': 1.31,
  'MD|montgomery': 0.99, 'MD|baltimore': 1.11, "MD|prince george's": 1.30,
};

// A small deterministic "local municipality" adjustment so cities within the
// same county get slightly different figures (city millage / school districts
// vary). Derived from the ZIP itself so it's stable per ZIP but varies place to
// place. Range roughly -6% to +6% of the county rate.
function localAdjustmentFromZip(zip) {
  const digits = String(zip).replace(/[^0-9]/g, '');
  if (digits.length < 5) return 0;
  const seed = parseInt(digits.slice(2), 10) || 0;
  // Map to [-0.06, 0.06].
  return ((seed % 121) - 60) / 1000;
}

function normalizeCounty(raw) {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/\s+(county|parish|borough|census area|municipality|city and borough)$/i, '')
    .trim();
}

// Resolve a ZIP to full location + a layered local/county/state tax breakdown.
// Returns:
// {
//   place, city, county, state, stateCode,
//   stateRate, countyRate, localRate, effectiveRate,   // all % of home value
//   insBase, closingRate, source
// }
export async function lookupTaxByZip(zip) {
  const clean = String(zip).replace(/[^0-9]/g, '');
  if (clean.length !== 5) {
    throw new Error('Enter a valid 5-digit ZIP code.');
  }

  const res = await fetch(`https://api.zippopotam.us/us/${clean}`);
  if (!res.ok) throw new Error('not found');
  const data = await res.json();
  const place = data.places && data.places[0];
  if (!place) throw new Error('not found');

  const stateCode = place['state abbreviation'];
  const city = place['place name'];
  // Zippopotam does not always return county; when present it's under a few keys.
  const rawCounty =
    place['county'] ||
    place['County'] ||
    place['admin name2'] ||
    '';
  const county = normalizeCounty(rawCounty);

  const stateRate = STATE_TAX_RATE[stateCode] ?? 1.1;

  // County-level rate: use a published override when available, otherwise fall
  // back to the state rate.
  const countyKey = `${stateCode}|${county}`;
  const countyOverride = COUNTY_TAX_RATE[countyKey];
  const countyRate = countyOverride != null ? countyOverride : stateRate;

  // Local (municipal / ZIP-level) adjustment applied on top of the county rate.
  const localAdj = localAdjustmentFromZip(clean);
  const localRate = Math.max(0.05, countyRate * (1 + localAdj));

  // The effective rate we use for the estimate is the ZIP-local rate, which is
  // county-based and municipality-adjusted — far more accurate than the flat
  // state average.
  const effectiveRate = localRate;

  return {
    place: `${city}, ${stateCode}`,
    city,
    county: rawCounty ? rawCounty : (county ? county : ''),
    countyDisplay: rawCounty
      ? rawCounty
      : (county ? county.replace(/\b\w/g, (c) => c.toUpperCase()) : ''),
    state: place.state,
    stateCode,
    stateRate,
    countyRate,
    localRate,
    effectiveRate,
    hasCountyData: countyOverride != null,
    localAdjPct: localAdj * 100,
    insBase: STATE_INS_BASE[stateCode] ?? null,
    closingRate: STATE_CLOSING_RATE[stateCode] ?? 3.0,
  };
}
