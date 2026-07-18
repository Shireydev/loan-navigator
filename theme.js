export const COLORS = {
  background: '#0F1729',
  surface: '#1A2438',
  surfaceElevated: '#233150',
  card: '#1E2A42',
  border: '#2E3B57',

  textPrimary: '#F1F5FB',
  textSecondary: '#A9B6CE',
  textMuted: '#6C7A96',

  accent: '#4F8DF7',
  accentDark: '#2E6BD6',

  teal: '#2DD4BF',
  purple: '#A78BFA',
  amber: '#FBBF24',
  green: '#34D399',
  red: '#F87171',
  pink: '#F472B6',

  gradientA: '#4F8DF7',
  gradientB: '#7C5CFC',
};

export const STORAGE_KEYS = {
  SAVED: '@mortgage_saved_v1',
  DEFAULTS: '@mortgage_defaults_v1',
};

export function fmtMoney(n, decimals = 0) {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  return (
    '$' +
    Number(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

// Format a raw numeric-input string with thousands separators while the user
// types. Preserves a single decimal point and any digits after it (including a
// trailing "." so the user can keep typing). Returns an empty string for empty
// input.
export function formatInputWithCommas(raw) {
  if (raw === null || raw === undefined) return '';
  // Keep only digits and dots.
  let cleaned = String(raw).replace(/[^0-9.]/g, '');
  if (cleaned === '') return '';

  // Collapse multiple dots to a single decimal point (keep the first).
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    const before = cleaned.slice(0, firstDot + 1);
    const after = cleaned.slice(firstDot + 1).replace(/\./g, '');
    cleaned = before + after;
  }

  const hasDot = cleaned.indexOf('.') !== -1;
  let [intPart, decPart = ''] = cleaned.split('.');

  // Strip leading zeros in the integer part but keep a single leading zero
  // (e.g. "0.5").
  intPart = intPart.replace(/^0+(?=\d)/, '');

  const intFormatted =
    intPart === '' ? (hasDot ? '0' : '') : Number(intPart).toLocaleString('en-US');

  if (hasDot) {
    return `${intFormatted}.${decPart}`;
  }
  return intFormatted;
}

// Parse a user-entered financial value without silently accepting malformed
// input such as multiple decimal points or unsupported characters.
export function parseLoanNumber(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[$,%\s,]/g, '');

  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return NaN;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}

function rangeError(label, value, { min = 0, max = Infinity, allowZero = true } = {}) {
  if (!Number.isFinite(value)) return `${label} must be a valid number.`;
  if ((!allowZero && value <= min) || (allowZero && value < min)) {
    return `${label} must be ${allowZero ? 'at least' : 'greater than'} ${min}.`;
  }
  if (value > max) return `${label} must not exceed ${max}.`;
  return null;
}

export function validateMortgageEstimate({
  price,
  down,
  rate,
  termYears,
  propertyTax = 0,
  insurance = 0,
  hoa = 0,
}) {
  return (
    rangeError('Home price', price, { min: 0, allowZero: false }) ||
    rangeError('Down payment', down) ||
    (down >= price ? 'Down payment must be less than the home price.' : null) ||
    rangeError('Interest rate', rate, { min: 0, max: 25 }) ||
    rangeError('Loan term', termYears, { min: 1, max: 50 }) ||
    rangeError('Property tax', propertyTax) ||
    rangeError('Homeowners insurance', insurance) ||
    rangeError('HOA dues', hoa)
  );
}

export function validatePayoffScenario({
  originalLoan,
  rate,
  originalTerm,
  remainingTerm,
  extra = 0,
  lump = 0,
  currentBalance,
  termLabel = 'term',
  maxTerm = 50,
  wholeTerms = false,
}) {
  return (
    rangeError('Original loan amount', originalLoan, { min: 0, allowZero: false }) ||
    rangeError('Interest rate', rate, { min: 0, max: 50 }) ||
    rangeError(`Original ${termLabel}`, originalTerm, { min: 1, max: maxTerm }) ||
    rangeError(`Remaining ${termLabel}`, remainingTerm, {
      min: 0,
      max: maxTerm,
      allowZero: false,
    }) ||
    (wholeTerms && (!Number.isInteger(originalTerm) || !Number.isInteger(remainingTerm))
      ? `${termLabel[0].toUpperCase() + termLabel.slice(1)} must be whole numbers.`
      : null) ||
    (remainingTerm > originalTerm
      ? `Remaining ${termLabel} cannot exceed the original ${termLabel}.`
      : null) ||
    rangeError('Additional monthly principal', extra) ||
    rangeError('Lump-sum payment', lump) ||
    (Number.isFinite(currentBalance) && lump > currentBalance
      ? 'Lump-sum payment cannot exceed the current balance.'
      : null)
  );
}

export function validateRefinanceScenario({
  balance,
  currentRate,
  originalTerm,
  remainingTerm,
  newRate,
  newTerm,
  costs = 0,
  termLabel = 'term',
  maxTerm = 50,
  wholeTerms = false,
}) {
  return (
    rangeError('Loan balance', balance, { min: 0, allowZero: false }) ||
    rangeError('Current interest rate', currentRate, { min: 0, max: 50 }) ||
    rangeError(`Original ${termLabel}`, originalTerm, { min: 1, max: maxTerm }) ||
    rangeError(`Remaining ${termLabel}`, remainingTerm, {
      min: 0,
      max: maxTerm,
      allowZero: false,
    }) ||
    (remainingTerm > originalTerm
      ? `Remaining ${termLabel} cannot exceed the original ${termLabel}.`
      : null) ||
    rangeError('New interest rate', newRate, { min: 0, max: 50 }) ||
    rangeError(`New ${termLabel}`, newTerm, { min: 1, max: maxTerm }) ||
    (wholeTerms &&
    (!Number.isInteger(originalTerm) ||
      !Number.isInteger(remainingTerm) ||
      !Number.isInteger(newTerm))
      ? `${termLabel[0].toUpperCase() + termLabel.slice(1)} must be whole numbers.`
      : null) ||
    rangeError('Refinance costs', costs)
  );
}

export function validateAutoPurchase({ price, down, trade, salesTax, rate, termMonths }) {
  const taxableAmount = Math.max(price - trade, 0);
  const maximumDown = taxableAmount * (1 + salesTax / 100);

  return (
    rangeError('Vehicle price', price, { min: 0, allowZero: false }) ||
    rangeError('Down payment', down) ||
    rangeError('Trade-in value', trade) ||
    (trade > price ? 'Trade-in value cannot exceed the vehicle price.' : null) ||
    rangeError('Sales-tax rate', salesTax, { min: 0, max: 20 }) ||
    (down >= maximumDown ? 'Down payment must be less than the amount due.' : null) ||
    rangeError('Interest rate', rate, { min: 0, max: 50 }) ||
    rangeError('Loan term', termMonths, { min: 1, max: 120 }) ||
    (!Number.isInteger(termMonths) ? 'Loan term must be a whole number of months.' : null)
  );
}

// Reconstruct the remaining principal from an original amortization schedule.
// Terms are expressed in months so the same function supports home and auto loans.
export function remainingBalanceFromOriginal(
  originalLoan,
  annualRatePct,
  originalTermMonths,
  monthsRemaining,
) {
  const origMonths = Math.max(Math.round(originalTermMonths), 1);
  const monthsLeft = Math.max(Math.min(Math.round(monthsRemaining), origMonths), 1);
  const monthsElapsed = origMonths - monthsLeft;
  const monthlyRate = annualRatePct / 100 / 12;
  const payment = monthlyPI(originalLoan, annualRatePct, origMonths / 12);

  if (monthlyRate === 0) {
    return Math.max(originalLoan - payment * monthsElapsed, 0);
  }

  const balance =
    originalLoan * Math.pow(1 + monthlyRate, monthsElapsed) -
    payment * ((Math.pow(1 + monthlyRate, monthsElapsed) - 1) / monthlyRate);
  return Math.max(balance, 0);
}

// Recover the original principal/payment when the user supplies a current
// remaining balance and position within the original amortization schedule.
export function originalLoanFromRemainingBalance(
  remainingBalance,
  annualRatePct,
  originalTermMonths,
  monthsRemaining,
) {
  const monthlyRate = annualRatePct / 100 / 12;
  const origMonths = Math.max(Math.round(originalTermMonths), 1);
  const monthsLeft = Math.max(Math.min(Math.round(monthsRemaining), origMonths), 1);
  const monthsElapsed = origMonths - monthsLeft;

  if (monthlyRate === 0) {
    const originalPrincipal = (remainingBalance * origMonths) / monthsLeft;
    return {
      originalPrincipal,
      payment: originalPrincipal / origMonths,
      monthsLeft,
      originalMonths: origMonths,
      monthsElapsed,
    };
  }

  const fullGrowth = Math.pow(1 + monthlyRate, origMonths);
  const elapsedGrowth = Math.pow(1 + monthlyRate, monthsElapsed);
  const factor = (fullGrowth - elapsedGrowth) / (fullGrowth - 1);
  const originalPrincipal = factor > 0 ? remainingBalance / factor : remainingBalance;

  return {
    originalPrincipal,
    payment: monthlyPI(originalPrincipal, annualRatePct, origMonths / 12),
    monthsLeft,
    originalMonths: origMonths,
    monthsElapsed,
  };
}

// Core mortgage math -------------------------------------------------

// Monthly payment (principal + interest)
export function monthlyPI(principal, annualRatePct, years) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Full amortization with optional extra monthly principal
export function amortize(principal, annualRatePct, years, extra = 0) {
  const r = annualRatePct / 100 / 12;
  const basePayment = monthlyPI(principal, annualRatePct, years);
  let balance = principal;
  let month = 0;
  let totalInterest = 0;
  const schedule = [];
  const maxMonths = years * 12 + 1200;

  while (balance > 0.01 && month < maxMonths) {
    month++;
    const interest = balance * r;
    let principalPaid = basePayment + extra - interest;
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    totalInterest += interest;
    if (month % 12 === 0 || balance <= 0.01) {
      schedule.push({
        year: Math.ceil(month / 12),
        balance: Math.max(balance, 0),
        totalInterest,
      });
    }
    if (balance <= 0.01) break;
  }

  return {
    months: month,
    years: month / 12,
    totalInterest,
    totalPaid: principal + totalInterest,
    monthlyPayment: basePayment + extra,
    basePayment,
    schedule,
  };
}

// Amortization given a FIXED monthly payment (rather than deriving the payment
// from the balance/term). This is what makes a one-time lump sum work
// correctly: after the lump reduces the principal, the borrower keeps paying
// the SAME monthly payment, so the loan is paid off sooner. The payment must
// exceed the first month's interest or the balance would never fall.
export function amortizeWithPayment(principal, annualRatePct, payment) {
  const r = annualRatePct / 100 / 12;
  let balance = principal;
  let month = 0;
  let totalInterest = 0;
  const schedule = [];
  const maxMonths = 12000;

  // Guard: if the payment can't cover interest, the loan never amortizes.
  if (payment <= balance * r) {
    return {
      months: Infinity,
      years: Infinity,
      totalInterest: Infinity,
      totalPaid: Infinity,
      monthlyPayment: payment,
      basePayment: payment,
      schedule: [{ year: 0, balance: principal, totalInterest: 0 }],
    };
  }

  while (balance > 0.01 && month < maxMonths) {
    month++;
    const interest = balance * r;
    let principalPaid = payment - interest;
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    totalInterest += interest;
    if (month % 12 === 0 || balance <= 0.01) {
      schedule.push({
        year: Math.ceil(month / 12),
        balance: Math.max(balance, 0),
        totalInterest,
      });
    }
    if (balance <= 0.01) break;
  }

  return {
    months: month,
    years: month / 12,
    totalInterest,
    totalPaid: principal + totalInterest,
    monthlyPayment: payment,
    basePayment: payment,
    schedule,
  };
}
