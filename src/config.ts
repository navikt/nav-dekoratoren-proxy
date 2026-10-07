export interface AppConfig {
	upstreamUrl: string;
	port: number;
	managementPort: number;
	upstreamConnectTimeoutMs: number;
	upstreamTimeoutMs: number;
	shutdownDelayMs: number;
}

function readNumber(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
	if (value === undefined) {
		return fallback;
	}

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
		throw new Error(`${name} must be an integer between ${min} and ${max}`);
	}

	return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const upstreamUrl = env.UPSTREAM_URL;
	if (!upstreamUrl) {
		throw new Error('UPSTREAM_URL is required');
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(upstreamUrl);
	} catch {
		throw new Error(`Invalid UPSTREAM_URL: ${upstreamUrl}`);
	}

	if (
		!['http:', 'https:'].includes(parsedUrl.protocol) ||
		!parsedUrl.hostname ||
		parsedUrl.username ||
		parsedUrl.password ||
		parsedUrl.pathname !== '/' ||
		parsedUrl.search ||
		parsedUrl.hash
	) {
		throw new Error('UPSTREAM_URL must be an HTTP(S) origin without credentials, path, query or fragment');
	}

	const port = readNumber('PORT', env.PORT, 8089, 1, 65535);
	const managementPort = readNumber('MANAGEMENT_PORT', env.MANAGEMENT_PORT, 8090, 1, 65535);
	if (port === managementPort) {
		throw new Error('PORT and MANAGEMENT_PORT must be different');
	}

	return {
		upstreamUrl: parsedUrl.origin,
		port,
		managementPort,
		upstreamConnectTimeoutMs: readNumber(
			'UPSTREAM_CONNECT_TIMEOUT_MS',
			env.UPSTREAM_CONNECT_TIMEOUT_MS,
			10_000,
			1,
			2_147_483_647
		),
		upstreamTimeoutMs: readNumber('UPSTREAM_TIMEOUT_MS', env.UPSTREAM_TIMEOUT_MS, 600_000, 1, 2_147_483_647),
		shutdownDelayMs: readNumber('SHUTDOWN_DELAY_MS', env.SHUTDOWN_DELAY_MS, 5_000, 0, 30_000),
	};
}
