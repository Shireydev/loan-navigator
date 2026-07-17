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
  return '$' + Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtNum(n, decimals = 0) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
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

  const intFormatted = intPart === ''
    ? (hasDot ? '0' : '')
    : Number(intPart).toLocaleString('en-US');

  if (hasDot) {
    return `${intFormatted}.${decPart}`;
  }
  return intFormatted;
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
