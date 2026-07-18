const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');

const DATASET_YEAR = 2024;
const DATASET_VERSION = 'acs2024-v1';

const OUTPUT_DIRECTORY = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIRECTORY, `county-tax-${DATASET_VERSION}.json`);

async function getCensusApiKey() {
	if (process.env.CENSUS_API_KEY) {
		return process.env.CENSUS_API_KEY.trim();
	}

	const prompt = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const apiKey = await prompt.question('Paste your Census API key, then press Enter: ');

	prompt.close();

	return apiKey.trim();
}

function parsePositiveNumber(value) {
	const number = Number(value);

	if (!Number.isFinite(number) || number <= 0) {
		return null;
	}

	return number;
}

async function downloadCountyData(apiKey) {
	const url = new URL(`https://api.census.gov/data/${DATASET_YEAR}/acs/acs5`);

	url.searchParams.set('get', 'NAME,B25103_001E,B25077_001E');
	url.searchParams.set('for', 'county:*');
	url.searchParams.set('in', 'state:*');
	url.searchParams.set('key', apiKey);

	console.log('Downloading county data from the Census API...');

	const response = await fetch(url, {
		headers: {
			Accept: 'application/json',
		},
	});

	if (!response.ok) {
		const responseText = await response.text();

		throw new Error(`Census request failed (${response.status}): ` + responseText.slice(0, 500));
	}

	const rows = await response.json();

	if (!Array.isArray(rows) || rows.length < 2) {
		throw new Error('The Census API returned no county records.');
	}

	return rows;
}

function buildDataset(rows) {
	const headers = rows[0];

	const indexes = {
		name: headers.indexOf('NAME'),
		medianTaxBill: headers.indexOf('B25103_001E'),
		medianHomeValue: headers.indexOf('B25077_001E'),
		state: headers.indexOf('state'),
		county: headers.indexOf('county'),
	};

	for (const [field, index] of Object.entries(indexes)) {
		if (index === -1) {
			throw new Error(`The Census response is missing the required field: ${field}`);
		}
	}

	const buckets = {};
	const rejected = [];

	for (const row of rows.slice(1)) {
		const stateFips = String(row[indexes.state]).padStart(2, '0');
		const countyCode = String(row[indexes.county]).padStart(3, '0');
		const countyFips = `${stateFips}${countyCode}`;

		const medianTaxBill = parsePositiveNumber(row[indexes.medianTaxBill]);

		const medianHomeValue = parsePositiveNumber(row[indexes.medianHomeValue]);

		if (!medianTaxBill || !medianHomeValue) {
			rejected.push({
				countyFips,
				name: row[indexes.name],
				reason: 'Missing or invalid Census values',
			});

			continue;
		}

		const effectiveTaxRate = medianTaxBill / medianHomeValue;

		if (effectiveTaxRate < 0.001 || effectiveTaxRate > 0.06) {
			rejected.push({
				countyFips,
				name: row[indexes.name],
				reason: 'Calculated rate is outside the validation range',
				effectiveTaxRate,
			});

			continue;
		}

		const bucketNumber = stateFips.charAt(0);

		if (!buckets[bucketNumber]) {
			buckets[bucketNumber] = {};
		}

		const fullName = String(row[indexes.name] ?? '');
		const countyName = fullName.split(',')[0].trim();

		buckets[bucketNumber][countyFips] = {
			countyFips,
			county: countyName,
			stateFips,
			effectiveTaxRate: Number(effectiveTaxRate.toFixed(6)),
			medianTaxBill,
			medianHomeValue,
			source: 'U.S. Census ACS 5-Year Estimates',
			sourceYear: DATASET_YEAR,
			confidenceLevel: 'Baseline',
			lastUpdated: new Date().toISOString().slice(0, 10),
			engineVersion: DATASET_VERSION,
		};
	}

	return {
		buckets,
		rejected,
	};
}

function createWranglerBulkFile(buckets, rejected) {
	const entries = [];

	for (const [bucketNumber, bucketData] of Object.entries(buckets)) {
		entries.push({
			key: `tax:${DATASET_VERSION}:${bucketNumber}`,
			value: JSON.stringify(bucketData),
		});
	}

	const importedCount = Object.values(buckets).reduce((total, bucket) => total + Object.keys(bucket).length, 0);

	entries.push({
		key: `tax:${DATASET_VERSION}:metadata`,
		value: JSON.stringify({
			engineVersion: DATASET_VERSION,
			source: 'U.S. Census ACS 5-Year Estimates',
			sourceYear: DATASET_YEAR,
			importedCount,
			rejectedCount: rejected.length,
			generatedAt: new Date().toISOString(),
		}),
	});

	return {
		entries,
		importedCount,
	};
}

async function main() {
	try {
		const apiKey = await getCensusApiKey();

		if (!apiKey) {
			throw new Error('A Census API key is required.');
		}

		const rows = await downloadCountyData(apiKey);
		const { buckets, rejected } = buildDataset(rows);

		const { entries, importedCount } = createWranglerBulkFile(buckets, rejected);

		fs.mkdirSync(OUTPUT_DIRECTORY, {
			recursive: true,
		});

		fs.writeFileSync(OUTPUT_FILE, JSON.stringify(entries, null, 2), 'utf8');

		console.log('');
		console.log('Dataset generated successfully.');
		console.log(`Imported counties: ${importedCount}`);
		console.log(`Rejected counties: ${rejected.length}`);
		console.log(`KV bucket records: ${entries.length - 1}`);
		console.log(`Output file: ${OUTPUT_FILE}`);

		if (rejected.length > 0) {
			const rejectedFile = path.join(OUTPUT_DIRECTORY, `rejected-${DATASET_VERSION}.json`);

			fs.writeFileSync(rejectedFile, JSON.stringify(rejected, null, 2), 'utf8');

			console.log(`Rejected records: ${rejectedFile}`);
		}

		console.log('');
		console.log('The dataset has only been generated locally. It has not been uploaded to Cloudflare yet.');
	} catch (error) {
		console.error('');
		console.error('Import failed:');
		console.error(error.message);
		process.exitCode = 1;
	}
}

main();
