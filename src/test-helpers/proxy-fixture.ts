import { serve, type ServerType } from '@hono/node-server';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterAll, beforeAll } from 'vitest';
import type { AppConfig } from '../config';
import { createProxyApp } from '../proxy';

export interface UpstreamRequest {
	method: string;
	url: string;
	headers: IncomingMessage['headers'];
	body: string;
}

type UpstreamHandler = (request: UpstreamRequest, response: ServerResponse) => void;

export async function listen(server: ServerType): Promise<string> {
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Expected a TCP server address');
	}
	return `http://127.0.0.1:${address.port}`;
}

export function closeServer(server: ServerType): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

export async function startProxy(upstreamUrl: string, config: Partial<AppConfig> = {}) {
	const { app, agent } = createProxyApp({
		upstreamUrl,
		port: 8089,
		managementPort: 8090,
		upstreamConnectTimeoutMs: 1000,
		upstreamTimeoutMs: 250,
		shutdownDelayMs: 0,
		...config,
	});
	const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
	if (!server.listening) {
		await new Promise<void>((resolve, reject) => {
			server.once('listening', resolve);
			server.once('error', reject);
		});
	}
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Expected a TCP proxy address');
	}
	return {
		url: `http://127.0.0.1:${address.port}`,
		close: async () => {
			await closeServer(server);
			await agent.close();
		},
	};
}

export function useProxyFixture(
	respond: UpstreamHandler = (request, response) => {
		response.writeHead(200, { 'content-type': 'text/plain' });
		response.end(`upstream:${request.body}`);
	},
	config: Partial<AppConfig> = {}
) {
	const requests: UpstreamRequest[] = [];
	let upstreamServer: ReturnType<typeof createServer>;
	let proxy: Awaited<ReturnType<typeof startProxy>>;

	beforeAll(async () => {
		upstreamServer = createServer((incoming, response) => {
			const chunks: Buffer[] = [];
			incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
			incoming.on('end', () => {
				const request = {
					method: incoming.method ?? 'GET',
					url: incoming.url ?? '/',
					headers: { ...incoming.headers },
					body: Buffer.concat(chunks).toString('utf-8'),
				};
				requests.push(request);
				respond(request, response);
			});
		});
		proxy = await startProxy(await listen(upstreamServer), config);
	});

	afterAll(async () => {
		if (proxy) {
			await proxy.close();
		}
		if (upstreamServer?.listening) {
			await closeServer(upstreamServer);
		}
	});

	return {
		get url() {
			return proxy.url;
		},
		get lastRequest() {
			const request = requests.at(-1);
			if (!request) {
				throw new Error('No request received by upstream');
			}
			return request;
		},
	};
}
