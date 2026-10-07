import { Readable } from 'node:stream';
import type { Dispatcher } from 'undici';
import { responseHeadersToHeadersMap } from '../headers';
import { getErrorCode, isUpstreamTimeout, logUpstreamError, type ProxyRequestDetails } from './proxy-errors';
import type { ProxyLifecycle } from './proxy-lifecycle';

export function createUpstreamResponse(
	upstream: Dispatcher.ResponseData,
	details: ProxyRequestDetails,
	lifecycle: ProxyLifecycle
): Response {
	const headers = responseHeadersToHeadersMap(upstream.headers);
	upstream.body.once('end', () => lifecycle.recordResult('proxied'));
	upstream.body.once('error', (error: unknown) => {
		if (lifecycle.clientAborted) {
			lifecycle.recordResult('client_abort');
			return;
		}
		const code = getErrorCode(error);
		logUpstreamError('Upstream response body failed', code, details);
		lifecycle.recordResult(isUpstreamTimeout(code) ? 'upstream_timeout' : 'upstream_error');
	});
	upstream.body.once('close', () => {
		if (!upstream.body.readableEnded) {
			lifecycle.recordResult(lifecycle.clientAborted ? 'client_abort' : 'upstream_error');
		}
	});

	const withoutBody = details.method === 'HEAD' || upstream.statusCode === 204 || upstream.statusCode === 304;
	if (withoutBody) {
		upstream.body.resume();
		return new Response(null, { status: upstream.statusCode, headers });
	}

	return new Response(Readable.toWeb(upstream.body), { status: upstream.statusCode, headers });
}
