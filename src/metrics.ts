import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

export const register = new Registry();
collectDefaultMetrics({ register });

export const requestsTotal = new Counter({
	name: 'dekoratoren_proxy_requests_total',
	help: 'Total count of proxied requests grouped by source, route, status class, team and result.',
	labelNames: ['source', 'route', 'status_class', 'team', 'result'],
	registers: [register],
});

export const upstreamDurationSeconds = new Histogram({
	name: 'dekoratoren_proxy_upstream_duration_seconds',
	help: 'Histogram of upstream response times from proxy to upstream.',
	labelNames: ['source', 'route'],
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
	registers: [register],
});

export function getStatusClass(statusCode?: number): string {
	if (statusCode === undefined) {
		return 'none';
	}

	if (statusCode >= 200 && statusCode < 300) {
		return '2xx';
	}
	if (statusCode >= 300 && statusCode < 400) {
		return '3xx';
	}
	if (statusCode >= 400 && statusCode < 500) {
		return '4xx';
	}
	if (statusCode >= 500) {
		return '5xx';
	}

	return 'none';
}

export function classifySource(hostHeader: string | null | undefined): string {
	const host = (hostHeader ?? '').trim();
	if (!host) {
		return 'other';
	}

	const hostWithoutPort = host.replace(/:\d+$/, '');
	const lower = hostWithoutPort.toLowerCase();

	if (lower === 'nav.no' || lower.endsWith('.nav.no')) {
		return 'ingress';
	}

	if (lower.startsWith('nav-dekoratoren')) {
		return 'service_discovery';
	}

	return 'other';
}

export function classifyRoute(rawTarget: string): string {
	let target = rawTarget || '/';
	const queryIndex = target.indexOf('?');
	if (queryIndex >= 0) {
		target = target.slice(0, queryIndex);
	}

	let route = target;
	if (route === '/dekoratoren' || route.startsWith('/dekoratoren/')) {
		route = route.slice('/dekoratoren'.length) || '/';
	} else if (route === '/common-html/v4/navno' || route.startsWith('/common-html/v4/navno/')) {
		route = route.slice('/common-html/v4/navno'.length) || '/';
	}

	route = route.replace(/\/$/, '');
	if (route === '') {
		route = '/';
	}

	const mapping: Record<string, string> = {
		'/ssr': 'ssr',
		'/header': 'header',
		'/footer': 'footer',
		'/auth': 'auth',
		'/env': 'env',
		'/csr': 'csr',
		'/main-menu': 'main-menu',
		'/ops-messages': 'ops-messages',
		'/api/search': 'search',
		'/api/consentping': 'consentping',
		'/api/version': 'version',
		'/': 'index',
	};

	if (mapping[route]) {
		return mapping[route];
	}

	if (/^\/api\/notifications\/[^/]+\/archive$/.test(route)) {
		return 'notifications-archive';
	}

	if (/^\/(?:csr\/)?(?:css\/)?client[^/]*\.(?:js|css)$/.test(route)) {
		return 'client-asset';
	}

	return 'other';
}

export function parseTeamName(rawTarget: string): string {
	try {
		const queryIndex = rawTarget.indexOf('?');
		const queryString = queryIndex >= 0 ? rawTarget.slice(queryIndex + 1) : '';
		const params = new URLSearchParams(queryString);
		const value = params.get('teamName');
		if (value === null) {
			return 'unknown';
		}

		const validPattern = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
		if (value.length > 100 || !validPattern.test(value)) {
			return 'unknown';
		}

		return value;
	} catch {
		return 'unknown';
	}
}

export function recordProxyMetrics(options: {
	host: string | null | undefined;
	rawTarget: string;
	statusCode?: number;
	result: 'proxied' | 'upstream_error' | 'upstream_timeout' | 'client_abort';
}): void {
	const { host, rawTarget, statusCode, result } = options;
	const source = classifySource(host);
	const route = classifyRoute(rawTarget);
	const team = parseTeamName(rawTarget);
	const statusClass = getStatusClass(statusCode);

	requestsTotal.labels({ source, route, status_class: statusClass, team, result }).inc();
}

export function recordUpstreamDuration(options: {
	host: string | null | undefined;
	rawTarget: string;
	durationMs: number;
}): void {
	const { host, rawTarget, durationMs } = options;
	const source = classifySource(host);
	const route = classifyRoute(rawTarget);
	upstreamDurationSeconds.labels({ source, route }).observe(durationMs / 1000);
}
