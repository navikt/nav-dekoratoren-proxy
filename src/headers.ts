const HOP_BY_HOP_HEADERS = new Set([
	'connection',
	'keep-alive',
	'proxy-connection',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
]);

function parseConnectionTokens(headerValue: string | null): Set<string> {
	if (!headerValue) {
		return new Set();
	}

	return new Set(
		headerValue
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter(Boolean)
	);
}

export function stripHopByHopHeaders(headers: Headers): Headers {
	const cleaned = new Headers(headers);
	const connectionHeader = cleaned.get('connection');
	const connectionTokens = parseConnectionTokens(connectionHeader);

	for (const headerName of Array.from(cleaned.keys())) {
		const lowerName = headerName.toLowerCase();
		if (HOP_BY_HOP_HEADERS.has(lowerName) || connectionTokens.has(lowerName)) {
			cleaned.delete(headerName);
		}
	}

	cleaned.delete('connection');
	return cleaned;
}

export function responseHeadersToHeadersMap(headers: Record<string, string | string[] | undefined>): Headers {
	return stripHopByHopHeaders(requestHeadersToHeadersMap(headers));
}

export function requestHeadersToHeadersMap(headers: Record<string, string | string[] | undefined>): Headers {
	const cleaned = new Headers();

	for (const [key, value] of Object.entries(headers)) {
		if (value === undefined || value === null) {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				cleaned.append(key, item);
			}
			continue;
		}

		cleaned.set(key, value);
	}

	return cleaned;
}
