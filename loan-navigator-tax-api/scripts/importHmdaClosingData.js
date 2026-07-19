const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { Readable } = require('node:stream');

const DATASET_YEAR = 2025;
const DATASET_VERSION = 'hmda2025-v1';
const API_URL = 'https://ffiec.cfpb.gov/v2/data-browser-api/view/csv';
const OUTPUT_DIRECTORY = path.join(__dirname, '..', 'data');
const MINIMUM_SAMPLE = 20;
const ALL_STATES = [
	'AL',
	'AK',
	'AZ',
	'AR',
	'CA',
	'CO',
	'CT',
	'DE',
	'DC',
	'FL',
	'GA',
	'HI',
	'ID',
	'IL',
	'IN',
	'IA',
	'KS',
	'KY',
	'LA',
	'ME',
	'MD',
	'MA',
	'MI',
	'MN',
	'MS',
	'MO',
	'MT',
	'NE',
	'NV',
	'NH',
	'NJ',
	'NM',
	'NY',
	'NC',
	'ND',
	'OH',
	'OK',
	'OR',
	'PA',
	'RI',
	'SC',
	'SD',
	'TN',
	'TX',
	'UT',
	'VT',
	'VA',
	'WA',
	'WV',
	'WI',
	'WY',
];

const REQUIRED_FIELDS = [
	'county_code',
	'action_taken',
	'loan_type',
	'loan_purpose',
	'lien_status',
	'reverse_mortgage',
	'open-end_line_of_credit',
	'business_or_commercial_purpose',
	'loan_amount',
	'total_loan_costs',
	'construction_method',
	'occupancy_type',
	'total_units',
];

function parseCsvLine(line) {
	const values = [];
	let value = '';
	let quoted = false;

	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if (character === '"') {
			if (quoted && line[index + 1] === '"') {
				value += '"';
				index += 1;
			} else {
				quoted = !quoted;
			}
		} else if (character === ',' && !quoted) {
			values.push(value);
			value = '';
		} else {
			value += character;
		}
	}

	values.push(value);
	return values;
}

function numberOrNull(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function amountBand(loanAmount) {
	if (loanAmount < 150000) return 'lt150';
	if (loanAmount < 300000) return '150to299';
	if (loanAmount < 500000) return '300to499';
	if (loanAmount < 750000) return '500to749';
	return '750plus';
}

function purposeName(value) {
	if (value === '1') return 'purchase';
	if (value === '31') return 'refinance';
	if (value === '32') return 'cashout';
	return null;
}

function percentile(sorted, quantile) {
	if (!sorted.length) return null;
	const position = (sorted.length - 1) * quantile;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	if (lower === upper) return sorted[lower];
	const fraction = position - lower;
	return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

function roundTo(value, increment = 50) {
	return Math.round(value / increment) * increment;
}

async function fetchState(stateCode) {
	const url = new URL(API_URL);
	url.searchParams.set('states', stateCode);
	url.searchParams.set('years', String(DATASET_YEAR));
	url.searchParams.set('actions_taken', '1');
	url.searchParams.set('loan_purposes', '1,31,32');

	let lastError;
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: { Accept: 'text/csv' },
				signal: AbortSignal.timeout(10 * 60 * 1000),
			});
			if (!response.ok || !response.body) {
				throw new Error(`HMDA returned HTTP ${response.status}.`);
			}
			return response;
		} catch (error) {
			lastError = error;
			if (attempt < 3) {
				console.warn(`${stateCode}: attempt ${attempt} failed; retrying...`);
			}
		}
	}

	throw lastError;
}

function isEligibleLoan(row) {
	const units = numberOrNull(row.total_units);
	return (
		row.action_taken === '1' &&
		row.lien_status === '1' &&
		row.reverse_mortgage === '2' &&
		row['open-end_line_of_credit'] === '2' &&
		row.business_or_commercial_purpose === '2' &&
		row.construction_method === '1' &&
		row.occupancy_type === '1' &&
		units >= 1 &&
		units <= 4
	);
}

async function collectState(stateCode, groups) {
	const response = await fetchState(stateCode);
	const input = Readable.fromWeb(response.body);
	const lines = readline.createInterface({ input, crlfDelay: Infinity });
	let indexes = null;
	let accepted = 0;
	let examined = 0;

	for await (const line of lines) {
		if (!indexes) {
			const headers = parseCsvLine(line);
			indexes = Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, headers.indexOf(field)]));
			const missing = REQUIRED_FIELDS.filter((field) => indexes[field] < 0);
			if (missing.length) {
				throw new Error(`HMDA response is missing required fields: ${missing.join(', ')}`);
			}
			continue;
		}

		examined += 1;
		const values = parseCsvLine(line);
		const row = Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, values[indexes[field]]?.trim() ?? '']));
		const countyFips = row.county_code;
		const purpose = purposeName(row.loan_purpose);
		const loanAmount = numberOrNull(row.loan_amount);
		const totalLoanCosts = numberOrNull(row.total_loan_costs);

		if (
			!isEligibleLoan(row) ||
			!/^\d{5}$/.test(countyFips) ||
			!purpose ||
			!loanAmount ||
			loanAmount < 25000 ||
			loanAmount > 5000000 ||
			!totalLoanCosts ||
			totalLoanCosts <= 0 ||
			totalLoanCosts / loanAmount > 0.15
		) {
			continue;
		}

		const key = `${countyFips}|${purpose}|${amountBand(loanAmount)}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(totalLoanCosts);
		accepted += 1;
	}

	console.log(`${stateCode}: accepted ${accepted.toLocaleString()} of ${examined.toLocaleString()}`);
	return { accepted, examined };
}

function buildRecords(groups) {
	const records = {};

	for (const [key, costs] of groups) {
		if (costs.length < MINIMUM_SAMPLE) continue;
		costs.sort((left, right) => left - right);
		const [countyFips, purpose, band] = key.split('|');
		records[countyFips] ??= {
			closingCosts: {},
			closingCostSource: 'FFIEC/CFPB HMDA originated-loan data',
			closingCostSourceYear: DATASET_YEAR,
			closingCostEngineVersion: DATASET_VERSION,
		};
		records[countyFips].closingCosts[purpose] ??= {};
		records[countyFips].closingCosts[purpose][band] = {
			p25: roundTo(percentile(costs, 0.25)),
			median: roundTo(percentile(costs, 0.5)),
			p75: roundTo(percentile(costs, 0.75)),
			sampleLoans: costs.length,
		};
	}

	return records;
}

function createWranglerBulkFile(records, metadata) {
	const buckets = {};

	for (const [countyFips, record] of Object.entries(records)) {
		const bucketNumber = countyFips.charAt(0);
		buckets[bucketNumber] ??= {};
		buckets[bucketNumber][countyFips] = record;
	}

	const entries = Object.entries(buckets).map(([bucketNumber, bucket]) => ({
		key: `closing:${DATASET_VERSION}:${bucketNumber}`,
		value: JSON.stringify(bucket),
	}));
	entries.push({
		key: `closing:${DATASET_VERSION}:metadata`,
		value: JSON.stringify(metadata),
	});
	return entries;
}

function selectedStates() {
	const requested = String(process.env.HMDA_STATES || '')
		.split(',')
		.map((state) => state.trim().toUpperCase())
		.filter(Boolean);
	const states = requested.length ? requested : ALL_STATES;
	const invalid = states.filter((state) => !ALL_STATES.includes(state));
	if (invalid.length) throw new Error(`Unknown state codes: ${invalid.join(', ')}`);
	return [...new Set(states)];
}

async function main() {
	const states = selectedStates();
	const groups = new Map();
	let accepted = 0;
	let examined = 0;

	for (const state of states) {
		console.log(`Downloading ${state} ${DATASET_YEAR} originated loans...`);
		const stateCounts = await collectState(state, groups);
		accepted += stateCounts.accepted;
		examined += stateCounts.examined;
	}

	const records = buildRecords(groups);
	const isNationwide = states.length === ALL_STATES.length;
	const suffix = isNationwide ? '' : `-partial-${states.join('-')}`;
	const outputFile = path.join(OUTPUT_DIRECTORY, `county-closing-${DATASET_VERSION}${suffix}.json`);
	const metadata = {
		engineVersion: DATASET_VERSION,
		source: 'FFIEC/CFPB HMDA Snapshot data',
		sourceYear: DATASET_YEAR,
		states,
		nationwide: isNationwide,
		examinedLoans: examined,
		acceptedLoans: accepted,
		countyCount: Object.keys(records).length,
		minimumSamplePerBand: MINIMUM_SAMPLE,
		generatedAt: new Date().toISOString(),
		method: 'Originated, first-lien, closed-end, owner-occupied, site-built, 1-4 unit, non-business loans',
	};
	const entries = createWranglerBulkFile(records, metadata);

	fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
	fs.writeFileSync(outputFile, JSON.stringify(entries, null, 2), 'utf8');
	console.log(`Counties with qualifying bands: ${Object.keys(records).length}`);
	console.log(`Output: ${outputFile}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
