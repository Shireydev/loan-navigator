const DATASET_VERSION = 'acs2024-v1';
const SUCCESS_CACHE_SECONDS = 60 * 60 * 24 * 7;
const NOT_FOUND_CACHE_SECONDS = 60 * 60 * 24;

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		/*
		 * Temporary protected importer endpoint.
		 *
		 * Example:
		 * /admin/import-acs?token=YOUR_IMPORT_TOKEN
		 */

		return handleTaxLookup(url, env, corsHeaders, ctx);
	},
};

async function handleTaxLookup(url, env, corsHeaders, ctx) {
	const zip = url.searchParams.get('zip')?.replace(/\D/g, '');

	if (!zip || zip.length !== 5) {
		return json({ error: 'Enter a valid five-digit ZIP code.' }, 400, corsHeaders);
	}

	if (!env.HUD_API_TOKEN) {
		return json({ error: 'HUD API token is not configured.' }, 500, corsHeaders);
	}

	if (!env.TAX_DATA) {
		return json({ error: 'Tax database binding is not configured.' }, 500, corsHeaders);
	}

	// Include the dataset version in the internal key so deploying a new tax
	// dataset cannot serve stale records left by the previous version.
	const cacheKey = new Request(`${url.origin}${url.pathname}?zip=${zip}&dataset=${DATASET_VERSION}`, { method: 'GET' });
	const cache = caches.default;
	const cachedResponse = await cache.match(cacheKey);

	if (cachedResponse) {
		return cachedResponse;
	}

	try {
		const hudUrl = 'https://www.huduser.gov/hudapi/public/usps' + `?type=2&query=${encodeURIComponent(zip)}`;

		const hudResponse = await fetch(hudUrl, {
			headers: {
				Authorization: `Bearer ${env.HUD_API_TOKEN}`,
				Accept: 'application/json',
			},
		});

		if (!hudResponse.ok) {
			return json(
				{
					error: 'HUD ZIP lookup failed.',
					hudStatus: hudResponse.status,
				},
				502,
				corsHeaders,
			);
		}

		const hudPayload = await hudResponse.json();

		const matches = Array.isArray(hudPayload?.data?.results) ? hudPayload.data.results : [];

		if (matches.length === 0) {
			const response = json(
				{ error: 'No county was found for this ZIP code.' },
				404,
				corsHeaders,
				`public, max-age=${NOT_FOUND_CACHE_SECONDS}`,
			);

			cacheResponse(cache, cacheKey, response, ctx);
			return response;
		}

		const bestMatch = [...matches].sort((a, b) => Number(b.res_ratio || 0) - Number(a.res_ratio || 0))[0];

		const countyFips = String(bestMatch.county ?? bestMatch.geoid ?? '').padStart(5, '0');

		if (!/^\d{5}$/.test(countyFips)) {
			return json({ error: 'HUD did not return a valid county FIPS code.' }, 502, corsHeaders);
		}

		/*
		 * Counties are divided into eight KV buckets according
		 * to the first digit of their state FIPS code.
		 */
		const bucketNumber = countyFips.charAt(0);

		const bucket = await env.TAX_DATA.get(`tax:${DATASET_VERSION}:${bucketNumber}`, 'json');

		let taxRecord = bucket?.[countyFips] ?? null;

		/*
		 * Keep support for the Franklin County development record
		 * while the nationwide import is being completed.
		 */
		if (!taxRecord) {
			taxRecord = await env.TAX_DATA.get(`county:${countyFips}`, 'json');
		}

		if (!taxRecord) {
			const response = json(
				{
					zip,
					city: bestMatch.city ?? null,
					state: bestMatch.state ?? null,
					countyFips,
					taxDataAvailable: false,
					message: 'No county tax record is available.',
				},
				404,
				corsHeaders,
				`public, max-age=${NOT_FOUND_CACHE_SECONDS}`,
			);

			cacheResponse(cache, cacheKey, response, ctx);
			return response;
		}

		const response = json(
			{
				zip,
				city: bestMatch.city ?? null,
				state: bestMatch.state ?? null,
				countyFips,
				taxDataAvailable: true,
				taxData: taxRecord,
				locationSource: 'HUD-USPS Crosswalk',
			},
			200,
			corsHeaders,
			`public, max-age=${SUCCESS_CACHE_SECONDS}`,
		);

		cacheResponse(cache, cacheKey, response, ctx);
		return response;
	} catch (error) {
		console.error('Tax lookup error:', error);

		return json(
			{
				error: 'Unable to complete the tax lookup.',
				details: error.message,
			},
			500,
			corsHeaders,
		);
	}
}

function cacheResponse(cache, cacheKey, response, ctx) {
	const write = cache.put(cacheKey, response.clone());

	if (ctx?.waitUntil) {
		ctx.waitUntil(write);
	}
}

function json(body, status, corsHeaders, cacheControl = 'no-store') {
	return new Response(JSON.stringify(body, null, 2), {
		status,
		headers: {
			...corsHeaders,
			'Content-Type': 'application/json',
			'Cache-Control': cacheControl,
		},
	});
}
