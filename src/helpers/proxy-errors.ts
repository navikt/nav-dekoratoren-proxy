import { logger } from '../logger';

export type ProxyResult = 'proxied' | 'upstream_error' | 'upstream_timeout' | 'client_abort';

export interface ProxyRequestDetails {
	host: string | undefined;
	rawTarget: string;
	method: string;
	startedAt: number;
}

export function getErrorCode(error: unknown): string {
	if (typeof error !== 'object' || error === null) {
		return 'UNKNOWN';
	}
	if ('code' in error && typeof error.code === 'string') {
		return error.code;
	}
	if ('cause' in error && typeof error.cause === 'object' && error.cause !== null && 'code' in error.cause) {
		if (typeof error.cause.code === 'string') {
			return error.cause.code;
		}
	}
	return 'UNKNOWN';
}

export function isUpstreamTimeout(code: string): boolean {
	return ['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(code);
}

export function logUpstreamError(message: string, code: string, details: ProxyRequestDetails): void {
	logger.error(message, undefined, {
		code,
		method: details.method,
		path: details.rawTarget.split('?')[0] || '/',
		durationMs: Date.now() - details.startedAt,
	});
}

export function createErrorResponse(isTimeout: boolean): Response {
	return new Response(isTimeout ? 'Gateway Timeout' : 'Bad Gateway', {
		status: isTimeout ? 504 : 502,
		headers: { 'content-type': 'text/plain' },
	});
}
