import type { HttpBindings } from '@hono/node-server';
import { Hono } from 'hono';
import { Agent } from 'undici';
import type { AppConfig } from './config';
import { requestHeadersToHeadersMap, stripHopByHopHeaders } from './headers';
import { createErrorResponse, getErrorCode, isUpstreamTimeout, logUpstreamError } from './helpers/proxy-errors';
import { createProxyLifecycle } from './helpers/proxy-lifecycle';
import { createUpstreamResponse } from './helpers/proxy-response';
import { logger } from './logger';

export type { ProxyResult } from './helpers/proxy-errors';

export function createProxyApp(config: AppConfig): { app: Hono<{ Bindings: HttpBindings }>; agent: Agent } {
	const agent = new Agent({
		connect: { timeout: config.upstreamConnectTimeoutMs },
		headersTimeout: config.upstreamTimeoutMs,
		bodyTimeout: config.upstreamTimeoutMs,
		keepAliveTimeout: 30_000,
	});
	const app = new Hono<{ Bindings: HttpBindings }>();

	app.all('*', async (c) => {
		const { incoming } = c.env;
		const details = {
			rawTarget: incoming.url ?? '/',
			method: incoming.method ?? 'GET',
			host: incoming.headers.host,
			startedAt: Date.now(),
		};
		const lifecycle = createProxyLifecycle(c.env, details, config.upstreamTimeoutMs);

		try {
			const headers = stripHopByHopHeaders(requestHeadersToHeadersMap(incoming.headers));
			logger.info(`Beta: ${details.rawTarget.split('?')[0] || '/'}`);
			const upstream = await agent.request({
				origin: config.upstreamUrl,
				path: details.rawTarget,
				method: details.method,
				headers: Object.fromEntries(headers),
				body: details.method !== 'GET' && details.method !== 'HEAD' ? incoming : undefined,
				signal: lifecycle.signal,
			});
			lifecycle.receiveUpstream(upstream);
			return createUpstreamResponse(upstream, details, lifecycle);
		} catch (error: unknown) {
			if (lifecycle.clientAborted) {
				lifecycle.recordResult('client_abort');
				return new Response(null, { status: 499 });
			}
			const code = getErrorCode(error);
			const isTimeout = lifecycle.timedOut || isUpstreamTimeout(code);
			lifecycle.setStatus(isTimeout ? 504 : 502);
			lifecycle.recordResult(isTimeout ? 'upstream_timeout' : 'upstream_error');
			logUpstreamError('Upstream request failed', lifecycle.timedOut ? 'UPSTREAM_TIMEOUT' : code, details);
			return createErrorResponse(isTimeout);
		} finally {
			lifecycle.clearTimeout();
		}
	});

	return { app, agent };
}
