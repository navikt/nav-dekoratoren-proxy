import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { request } from 'undici';
import { useProxyFixture } from './test-helpers/proxy-fixture';

describe('proxy response forwarding', () => {
	const compressed = gzipSync(Buffer.from('gzip-body'));
	const proxy = useProxyFixture((incoming, response) => {
		switch (incoming.url) {
			case '/no-content':
				response.writeHead(204);
				response.end();
				break;
			case '/not-modified':
				response.writeHead(304, { etag: '"test-version"' });
				response.end();
				break;
			case '/set-cookie':
				response.writeHead(200, { 'set-cookie': ['a=1; Path=/', 'b=2; Path=/'] });
				response.end('cookies');
				break;
			case '/redirect':
				response.writeHead(302, { location: 'https://cdn.nav.no/test', 'cache-control': 'no-store' });
				response.end('redirect');
				break;
			case '/gzip':
				response.writeHead(200, {
					'content-type': 'text/plain',
					'content-encoding': 'gzip',
					'content-length': String(compressed.length),
					'cache-control': 'no-store',
				});
				response.end(compressed);
				break;
			case '/policy':
				response.writeHead(200, {
					'access-control-allow-origin': String(incoming.headers.origin ?? ''),
					'access-control-allow-credentials': 'true',
					'content-security-policy': "default-src 'self'",
					'cache-control': 'no-store',
					pragma: 'no-cache',
					expires: '0',
				});
				response.end('policy');
				break;
			case '/chunks':
				response.writeHead(200, { 'content-type': 'text/plain', 'transfer-encoding': 'chunked' });
				response.write('first');
				setTimeout(() => response.end('second'), 200);
				break;
			default:
				throw new Error(`Unexpected test path: ${incoming.url}`);
		}
	});

	it.each([
		['/no-content', 204],
		['/not-modified', 304],
	] as const)('forwards a bodyless response at %s', async (path, status) => {
		const response = await request(`${proxy.url}${path}`);
		expect(response.statusCode).toBe(status);
		expect(await response.body.text()).toBe('');
	});

	it('returns both Set-Cookie headers', async () => {
		const response = await request(`${proxy.url}/set-cookie`);
		expect(response.statusCode).toBe(200);
		expect(response.headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/']);
		await response.body.dump();
	});

	it('does not follow upstream redirects', async () => {
		const response = await request(`${proxy.url}/redirect`);
		expect(response.statusCode).toBe(302);
		expect(response.headers.location).toBe('https://cdn.nav.no/test');
		await response.body.dump();
	});

	it('preserves gzip bytes and encoding headers', async () => {
		const response = await request(`${proxy.url}/gzip`);
		expect(response.statusCode).toBe(200);
		expect(response.headers['content-encoding']).toBe('gzip');
		expect(response.headers['content-length']).toBe(String(compressed.length));
		expect(Buffer.from(await response.body.arrayBuffer())).toEqual(compressed);
	});

	it('preserves policy headers', async () => {
		const response = await request(`${proxy.url}/policy`, { headers: { Origin: 'https://www.nav.no' } });
		expect(response.headers['access-control-allow-origin']).toBe('https://www.nav.no');
		expect(response.headers['access-control-allow-credentials']).toBe('true');
		expect(response.headers['content-security-policy']).toBe("default-src 'self'");
		expect(response.headers['cache-control']).toBe('no-store');
		expect(response.headers.pragma).toBe('no-cache');
		expect(response.headers.expires).toBe('0');
		await response.body.dump();
	});

	it('delivers the first chunk before upstream finishes', async () => {
		const response = await request(`${proxy.url}/chunks`);
		const chunks = response.body[Symbol.asyncIterator]();
		const first = await chunks.next();
		expect(Buffer.from(first.value).toString()).toBe('first');
		expect(response.body.readableEnded).toBe(false);
		const second = await chunks.next();
		expect(Buffer.from(second.value).toString()).toBe('second');
		expect((await chunks.next()).done).toBe(true);
	});
});
