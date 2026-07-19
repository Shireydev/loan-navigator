const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

const DATASET_YEAR = 2024;
const DATASET_VERSION = 'acs2024-v2';
const BASE_URL = 'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData';

const TABLES = {
	taxes: 'acsdt5y2024-b25090.dat',
	values: 'acsdt5y2024-b25082.dat',
	medianValues: 'acsdt5y2024-b25097.dat',
	insurance: 'acsdt5y2024-b25141.dat',
};

const OUTPUT_DIRECTORY = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIRECTORY, `county-cost-${DATASET_VERSION}.json`);
const REJECTED_FILE = path.join(OUTPUT_DIRECTORY, `rejected-${DATASET_VERSION}.json`);
const LEGACY_FILE = path.join(OUTPUT_DIRECTORY, 'county-tax-acs2024-v1.json');

const INSURANCE_BINS = [
	{ field: 'B25141_E003', low: 0, high: 100 },
	{ field: 'B25141_E004', low: 100, high: 300 },
	{ field: 'B25141_E005', low: 300, high: 500 },
	{ field: 'B25141_E006', low: 500, high: 800 },
	{ field: 'B25141_E007', low: 800, high: 1000 },
	{ field: 'B25141_E008', low: 1000, high: 1500 },
	{ field: 'B25141_E009', low: 1500, high: 2000 },
	{ field: 'B25141_E010', low: 2000, high: 2500 },
	{ field: 'B25141_E011', low: 2500, high: 3000 },
	{ field: 'B25141_E012', low: 3000, high: 3500 },
	{ field: 'B25141_E013', low: 3500, high: 4000 },
	// The published table is open-ended at $4,000. A $6,500 upper bound is
	// used only to interpolate a display range; the source bin remains stored.
	{ field: 'B25141_E014', low: 4000, high: 6500 },
];

function numberOrNull(value) {
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : null;
}

function roundTo(value, increment = 10) {
	return Math.round(value / increment) * increment;
}

function loadLegacyCountyNames() {
	const names = new Map();

	if (!fs.existsSync(LEGACY_FILE)) return names;

	const entries = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));

	for (const entry of entries) {
		if (!entry.key.startsWith('tax:') || entry.key.endsWith(':metadata')) continue;

		const bucket = JSON.parse(entry.value);
		for (const [fips, record] of Object.entries(bucket)) {
			if (record.county) names.set(fips, record.county);
		}
	}

	return names;
}

async function downloadTable(filename, directory) {
	const destination = path.join(directory, filename);
	const response = await fetch(`${BASE_URL}/${filename}`);

	if (!response.ok || !response.body) {
		throw new Error(`Census download failed for ${filename} (${response.status}).`);
	}

	await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
	return destination;
}

async function readCountyRows(filename) {
	const rows = new Map();
	const input = fs.createReadStream(filename, { encoding: 'utf8' });
	const lines = readline.createInterface({ input, crlfDelay: Infinity });
	let headers = null;

	for await (const line of lines) {
		if (!headers) {
			headers = line.split('|');
			continue;
		}

		const values = line.split('|');
		const geoId = values[0];
		const match = /^0500000US(\d{5})$/.exec(geoId);
		if (!match) continue;

		const record = {};
		for (let index = 1; index < headers.length; index += 1) {
			record[headers[index]] = values[index];
		}
		rows.set(match[1], record);
	}

	return rows;
}

function insuranceQuantile(bins, total, quantile) {
	if (!total) return null;
	const target = total * quantile;
	let cumulative = 0;

	for (const bin of bins) {
		const next = cumulative + bin.count;
		if (target <= next && bin.count > 0) {
			const position = Math.max(0, Math.min(1, (target - cumulative) / bin.count));
			return bin.low + (bin.high - bin.low) * position;
		}
		cumulative = next;
	}

	return bins.at(-1)?.high ?? null;
}

function buildInsuranceEstimate(row) {
	if (!row) return null;

	const bins = INSURANCE_BINS.map((bin) => ({
		...bin,
		count: numberOrNull(row[bin.field]) ?? 0,
	}));
	const total = bins.reduce((sum, bin) => sum + bin.count, 0);
	if (total <= 0) return null;

	const weightedMean = bins.reduce((sum, bin) => sum + bin.count * ((bin.low + bin.high) / 2), 0);
	const estimate = roundTo(weightedMean / total, 10);
	const low = roundTo(insuranceQuantile(bins, total, 0.25), 10);
	const median = roundTo(insuranceQuantile(bins, total, 0.5), 10);
	const high = roundTo(insuranceQuantile(bins, total, 0.75), 10);

	return {
		annualEstimate: estimate,
		annualMedian: median,
		annualLow: Math.min(low, estimate),
		annualHigh: Math.max(high, estimate),
		sampleHomes: total,
		marginOfError: numberOrNull(row.B25141_M002),
		openEndedHighShare: Number(((bins.at(-1).count / total) * 100).toFixed(1)),
	};
}

function determineConfidence({ taxEstimate, taxMoe, valueEstimate, valueMoe, insurance }) {
	const taxRelativeError =
		taxEstimate > 0 && valueEstimate > 0
			? Math.hypot((taxMoe ?? taxEstimate) / taxEstimate, (valueMoe ?? valueEstimate) / valueEstimate)
			: Infinity;
	const insuranceRelativeError =
		insurance?.sampleHomes > 0 && Number.isFinite(insurance.marginOfError) ? insurance.marginOfError / insurance.sampleHomes : Infinity;

	if (taxRelativeError <= 0.15 && insuranceRelativeError <= 0.15 && insurance.sampleHomes >= 100) {
		return 'High';
	}
	if (taxRelativeError <= 0.3 && insuranceRelativeError <= 0.35 && insurance.sampleHomes >= 30) {
		return 'Moderate';
	}
	return 'Baseline';
}

function buildDataset(tables, countyNames) {
	const records = {};
	const rejected = [];
	const allFips = new Set([...tables.taxes.keys(), ...tables.values.keys(), ...tables.medianValues.keys(), ...tables.insurance.keys()]);

	for (const countyFips of allFips) {
		const taxRow = tables.taxes.get(countyFips);
		const valueRow = tables.values.get(countyFips);
		const medianValueRow = tables.medianValues.get(countyFips);
		const insurance = buildInsuranceEstimate(tables.insurance.get(countyFips));
		const aggregateTaxes = numberOrNull(taxRow?.B25090_E002);
		const aggregateTaxMoe = numberOrNull(taxRow?.B25090_M002);
		const aggregateValue = numberOrNull(valueRow?.B25082_E002);
		const aggregateValueMoe = numberOrNull(valueRow?.B25082_M002);
		const medianHomeValue = numberOrNull(medianValueRow?.B25097_E002);
		const effectiveTaxRate = aggregateTaxes > 0 && aggregateValue > 0 ? aggregateTaxes / aggregateValue : null;

		if (!effectiveTaxRate || effectiveTaxRate > 0.08 || !insurance) {
			rejected.push({
				countyFips,
				county: countyNames.get(countyFips) ?? null,
				reason: !effectiveTaxRate
					? 'Missing aggregate tax or value data'
					: effectiveTaxRate > 0.08
						? 'Effective tax rate is outside the validation range'
						: 'Missing homeowners insurance distribution',
			});
			continue;
		}

		records[countyFips] = {
			countyFips,
			county: countyNames.get(countyFips) ?? `County ${countyFips}`,
			stateFips: countyFips.slice(0, 2),
			effectiveTaxRate: Number(effectiveTaxRate.toFixed(6)),
			aggregateTaxes,
			aggregateValue,
			medianHomeValue,
			insurance,
			source: 'U.S. Census ACS 5-Year Estimates',
			sourceYear: DATASET_YEAR,
			confidenceLevel: determineConfidence({
				taxEstimate: aggregateTaxes,
				taxMoe: aggregateTaxMoe,
				valueEstimate: aggregateValue,
				valueMoe: aggregateValueMoe,
				insurance,
			}),
			lastUpdated: new Date().toISOString().slice(0, 10),
			engineVersion: DATASET_VERSION,
		};
	}

	return { records, rejected };
}

function createWranglerBulkFile(records, rejected) {
	const buckets = {};

	for (const [countyFips, record] of Object.entries(records)) {
		const bucketNumber = countyFips.charAt(0);
		if (!buckets[bucketNumber]) buckets[bucketNumber] = {};
		buckets[bucketNumber][countyFips] = record;
	}

	const entries = Object.entries(buckets).map(([bucketNumber, bucket]) => ({
		key: `cost:${DATASET_VERSION}:${bucketNumber}`,
		value: JSON.stringify(bucket),
	}));

	entries.push({
		key: `cost:${DATASET_VERSION}:metadata`,
		value: JSON.stringify({
			engineVersion: DATASET_VERSION,
			source: 'U.S. Census ACS 5-Year Estimates',
			sourceYear: DATASET_YEAR,
			importedCount: Object.keys(records).length,
			rejectedCount: rejected.length,
			generatedAt: new Date().toISOString(),
			propertyTaxMethod: 'aggregate taxes / aggregate value for mortgaged homes',
			insuranceMethod: 'county distribution of annual costs for mortgaged homes',
		}),
	});

	return entries;
}

async function main() {
	const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'loan-navigator-cost-'));

	try {
		const countyNames = loadLegacyCountyNames();
		const downloaded = {};

		for (const [name, filename] of Object.entries(TABLES)) {
			console.log(`Downloading ${filename}...`);
			downloaded[name] = await downloadTable(filename, tempDirectory);
		}

		const tables = {};
		for (const [name, filename] of Object.entries(downloaded)) {
			console.log(`Reading ${path.basename(filename)}...`);
			tables[name] = await readCountyRows(filename);
		}

		const { records, rejected } = buildDataset(tables, countyNames);
		const entries = createWranglerBulkFile(records, rejected);

		fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
		fs.writeFileSync(OUTPUT_FILE, JSON.stringify(entries, null, 2), 'utf8');
		fs.writeFileSync(REJECTED_FILE, JSON.stringify(rejected, null, 2), 'utf8');

		console.log(`Imported counties: ${Object.keys(records).length}`);
		console.log(`Rejected counties: ${rejected.length}`);
		console.log(`Output: ${OUTPUT_FILE}`);
	} finally {
		const resolvedTemp = path.resolve(tempDirectory);
		const resolvedRoot = path.resolve(os.tmpdir());
		if (resolvedTemp.startsWith(`${resolvedRoot}${path.sep}`)) {
			fs.rmSync(resolvedTemp, { recursive: true, force: true });
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
