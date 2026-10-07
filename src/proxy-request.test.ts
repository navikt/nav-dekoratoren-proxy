import { request as httpRequest } from 'node:http';
import { describe, expect, it } from 'vitest';
import { request } from 'undici';
import { useProxyFixture } from './test-helpers/proxy-fixture';

describe('proxy request forwarding', () => {
	const proxy = useProxyFixture();

	it.each(['/dekoratoren/ssr?teamName=a.b&ver=abc1234', '/dekoratoren//ssr', '/common-html/v4/navno/header?x=%2F'])(
		'preserves the path and query: %s',
		async (path) => {
			const response = await request(`${proxy.url}${path}`, { headers: { Host: 'www.nav.no' } });
			expect(response.statusCode).toBe(200);
			expect(proxy.lastRequest.url).toBe(path);
			expect(proxy.lastRequest.headers.host).toBe('www.nav.no');
			await response.body.dump();
		}
	);

	it('preserves request headers and strips Connection-nominated headers', async () => {
		// Undici rejects custom Connection values, so this case needs the Node HTTP client.
		await new Promise<void>((resolve, reject) => {
			const client = httpRequest(
				`${proxy.url}/headers-check`,
				{
					headers: {
						Host: 'nav-dekoratoren.personbruker',
						Cookie: 'a=b',
						Origin: 'https://www.nav.no',
						Authorization: '******',
						'Content-Type': 'application/json',
						Connection: 'keep-alive, custom-token',
						'custom-token': 'remove-me',
					},
				},
				(response) => {
					expect(response.statusCode).toBe(200);
					response.resume();
					response.on('end', resolve);
					response.on('error', reject);
				}
			);
			client.on('error', reject);
			client.end();
		});
		const { headers } = proxy.lastRequest;
		expect(headers.host).toBe('nav-dekoratoren.personbruker');
		expect(headers.cookie).toBe('a=b');
		expect(headers.origin).toBe('https://www.nav.no');
		expect(headers['content-type']).toBe('application/json');
		expect(headers.connection).not.toContain('custom-token');
		expect(headers['custom-token']).toBeUndefined();
	});

	it('streams a JSON request body unchanged', async () => {
		const body = JSON.stringify({ hello: 'world' });
		const response = await request(`${proxy.url}/headers-check`, {
			method: 'POST',
			headers: { Host: 'www.nav.no', 'content-type': 'application/json' },
			body,
		});
		expect(response.statusCode).toBe(200);
		expect(proxy.lastRequest.body).toBe(body);
		await response.body.dump();
	});

	it.each(['HEAD', 'OPTIONS', 'PUT'])('forwards the %s method', async (method) => {
		const response = await request(`${proxy.url}/method-check`, {
			method,
			body: method === 'PUT' ? 'put-body' : undefined,
		});
		expect(response.statusCode).toBe(200);
		expect(proxy.lastRequest.method).toBe(method);
		await response.body.dump();
	});

	it('streams a 5 MB body without changing its bytes', async () => {
		const body = Buffer.alloc(5 * 1024 * 1024, 'x');
		const response = await request(`${proxy.url}/large-body`, { method: 'POST', body });
		expect(response.statusCode).toBe(200);
		expect(Buffer.from(proxy.lastRequest.body)).toEqual(body);
		await response.body.dump();
	});
});
