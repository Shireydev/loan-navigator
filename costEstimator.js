function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundTo(value, increment = 10) {
  return Math.round(value / increment) * increment;
}

function amountBand(loanAmount) {
  if (loanAmount < 150000) return 'lt150';
  if (loanAmount < 300000) return '150to299';
  if (loanAmount < 500000) return '300to499';
  if (loanAmount < 750000) return '500to749';
  return '750plus';
}

export function estimatePropertyTax(info, homeValue) {
  const value = finitePositive(homeValue);
  const ratePct = finitePositive(info?.effectiveRate ?? info?.stateRate);

  if (!value || !ratePct) {
    return {
      annualEstimate: 0,
      ratePct: ratePct ?? 0,
      isCountyEstimate: false,
      confidenceLevel: 'Fallback',
    };
  }

  return {
    annualEstimate: value * (ratePct / 100),
    ratePct,
    isCountyEstimate: info?.hasCountyData === true,
    confidenceLevel: info?.confidenceLevel || 'Baseline',
    source: info?.source || 'Planning estimate',
    sourceYear: info?.sourceYear ?? null,
  };
}

export function estimateHomeInsurance(info, homeValue) {
  const value = finitePositive(homeValue) ?? 400000;
  const countyInsurance = info?.insurance;
  const countyEstimate = finitePositive(countyInsurance?.annualEstimate);

  if (countyEstimate) {
    const medianHomeValue = finitePositive(info?.medianHomeValue);
    // Market value is not the same as replacement cost, so use a deliberately
    // sublinear adjustment. This preserves the county-observed premium as the
    // anchor without pretending that premiums move dollar-for-dollar with price.
    const valueAdjustment = medianHomeValue
      ? clamp(Math.pow(value / medianHomeValue, 0.35), 0.65, 1.8)
      : 1;
    const low = finitePositive(countyInsurance.annualLow) ?? countyEstimate * 0.75;
    const high = finitePositive(countyInsurance.annualHigh) ?? countyEstimate * 1.35;

    return {
      annualEstimate: roundTo(countyEstimate * valueAdjustment),
      annualLow: roundTo(Math.min(low, countyEstimate) * valueAdjustment),
      annualHigh: roundTo(Math.max(high, countyEstimate) * valueAdjustment),
      valueAdjustment,
      isCountyEstimate: true,
      sampleHomes: finitePositive(countyInsurance.sampleHomes),
      confidenceLevel: info?.confidenceLevel || 'Baseline',
      source: info?.source || 'U.S. Census ACS 5-Year Estimates',
      sourceYear: info?.sourceYear ?? null,
    };
  }

  const stateBase = finitePositive(info?.insBase) ?? value * 0.0035;
  const valueAdjustment = clamp(Math.pow(value / 400000, 0.35), 0.65, 1.8);
  const estimate = stateBase * valueAdjustment;

  return {
    annualEstimate: roundTo(estimate),
    annualLow: roundTo(estimate * 0.75),
    annualHigh: roundTo(estimate * 1.35),
    valueAdjustment,
    isCountyEstimate: false,
    sampleHomes: null,
    confidenceLevel: 'Fallback',
    source: 'State-average fallback',
    sourceYear: null,
  };
}

export function estimateClosingCosts(info, { homePrice, loanAmount, purpose = 'purchase' } = {}) {
  const price = finitePositive(homePrice);
  const balance = finitePositive(loanAmount) ?? price;
  const basis = purpose === 'purchase' ? (price ?? balance) : (balance ?? price);

  if (!basis) {
    return {
      estimate: 0,
      low: 0,
      high: 0,
      isHmdaEstimate: false,
      source: 'Planning estimate',
    };
  }

  const band = amountBand(balance ?? basis);
  const hmda = info?.closingCosts?.[purpose]?.[band];
  const hmdaMedian = finitePositive(hmda?.median);

  if (hmdaMedian) {
    return {
      estimate: hmdaMedian,
      low: finitePositive(hmda.p25) ?? hmdaMedian * 0.75,
      high: finitePositive(hmda.p75) ?? hmdaMedian * 1.25,
      isHmdaEstimate: true,
      sampleLoans: finitePositive(hmda.sampleLoans),
      source: info?.closingCostSource || 'HMDA originated-loan data',
      sourceYear: info?.closingCostSourceYear ?? null,
      band,
    };
  }

  const purchaseRatePct = finitePositive(info?.closingRate) ?? 3;
  const ratePct = purpose === 'purchase' ? purchaseRatePct : purchaseRatePct * 0.65;
  const estimate = basis * (ratePct / 100);

  return {
    estimate,
    low: estimate * 0.75,
    high: estimate * 1.25,
    ratePct,
    isHmdaEstimate: false,
    sampleLoans: null,
    source: info?.stateCode ? `${info.stateCode} planning fallback` : 'Planning fallback',
    sourceYear: null,
    band,
  };
}
