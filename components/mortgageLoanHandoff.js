let revision = 0;
let latestPayoffLoan = null;
let latestSignature = '';

// This is an in-session bridge between calculators, not persisted user data.
// A revision lets the refinance screen apply each payoff update only once.
export function publishPayoffLoan(details) {
  const signature = JSON.stringify(details);
  if (signature === latestSignature) return;

  latestSignature = signature;
  revision += 1;
  latestPayoffLoan = { revision, details };
}

export function getLatestPayoffLoan() {
  return latestPayoffLoan;
}
