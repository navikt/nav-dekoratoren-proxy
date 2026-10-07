import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { describe, expect, it } from 'vitest';
import { request } from 'undici';
import { createManagementApp } from './management';
import { closeServer, listen, useProxyFixture } from './test-helpers/proxy-fixture';

describe('proxy and management separation', () => {
	const proxy = useProxyFixture();

	it('serves health and metrics on the management port', async () => {
		const managementServer = createServer(getRequestListener(createManagementApp(() => true).fetch));
		const url = await listen(managementServer);
		try {
			for (const path of ['/isAlive', '/isReady', '/metrics']) {
				const response = await request(`${url}${path}`);
				expect(response.statusCode).toBe(200);
				await response.body.dump();
			}
		} finally {
			await closeServer(managementServer);
		}
	});

	it.each(['/isAlive', '/isReady', '/metrics'])('forwards %s on the proxy port', async (path) => {
		const response = await request(`${proxy.url}${path}`);
		expect(response.statusCode).toBe(200);
		expect(proxy.lastRequest.url).toBe(path);
		await response.body.dump();
	});
});
