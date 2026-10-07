import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { request } from 'undici';
import { closeServer, listen, startProxy, useProxyFixture } from './test-helpers/proxy-fixture';

describe('proxy error responses', () => {
	const proxy = useProxyFixture((incoming, response) => {
		const status = incoming.url === '/error' ? 500 : 404;
		response.writeHead(status, { 'content-type': 'text/plain' });
		response.end(status === 500 ? 'boom' : 'not found');
	});

	it.each([
		['/error', 500, 'boom'],
		['/not-found', 404, 'not found'],
	] as const)('passes through upstream errors at %s', async (path, status, body) => {
		const response = await request(`${proxy.url}${path}`);
		expect(response.statusCode).toBe(status);
		expect(await response.body.text()).toBe(body);
	});

	it('returns 502 when upstream is unavailable', async () => {
		const unusedServer = createServer();
		const upstreamUrl = await listen(unusedServer);
		await closeServer(unusedServer);
		const unavailableProxy = await startProxy(upstreamUrl, {
			upstreamConnectTimeoutMs: 200,
			upstreamTimeoutMs: 200,
		});
		try {
			const response = await request(`${unavailableProxy.url}/bad-url`, { headers: { Host: 'www.nav.no' } });
			expect(response.statusCode).toBe(502);
			expect(await response.body.text()).toBe('Bad Gateway');
		} finally {
			await unavailableProxy.close();
		}
	});
});

describe('proxy upstream timeouts', () => {
	const proxy = useProxyFixture(
		(_incoming, response) => {
			setTimeout(() => {
				response.writeHead(200, { 'content-type': 'text/plain' });
				response.end('late');
			}, 500);
		},
		{ upstreamConnectTimeoutMs: 200, upstreamTimeoutMs: 50 }
	);

	it('returns 504 when upstream takes too long', async () => {
		const response = await request(`${proxy.url}/slow`, { headers: { Host: 'www.nav.no' } });
		expect(response.statusCode).toBe(504);
		expect(await response.body.text()).toBe('Gateway Timeout');
	});
});
