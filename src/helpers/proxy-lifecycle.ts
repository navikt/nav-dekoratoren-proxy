import type { HttpBindings } from '@hono/node-server';
import type { Dispatcher } from 'undici';
import { recordProxyMetrics, recordUpstreamDuration } from '../metrics';
import type { ProxyRequestDetails, ProxyResult } from './proxy-errors';

export function createProxyLifecycle(
	{ incoming, outgoing }: HttpBindings,
	details: ProxyRequestDetails,
	timeoutMs: number
) {
	const controller = new AbortController();
	let clientAborted = false;
	let timedOut = false;
	let statusCode: number | undefined;
	let upstreamBody: Dispatcher.ResponseData['body'] | undefined;
	let metricsRecorded = false;

	const recordResult = (result: ProxyResult): void => {
		if (metricsRecorded) {
			return;
		}
		metricsRecorded = true;
		try {
			recordProxyMetrics({ ...details, statusCode, result });
		} catch {
			// Metrics must never affect proxying.
		}
	};
	const abortClient = () => {
		clientAborted = true;
		controller.abort();
		upstreamBody?.destroy();
	};
	const onIncomingClose = () => {
		if (!incoming.complete) {
			abortClient();
		}
	};
	const cleanup = () => {
		incoming.off('aborted', abortClient);
		incoming.off('close', onIncomingClose);
		outgoing.off('close', onOutgoingClose);
		outgoing.off('finish', cleanup);
	};
	const onOutgoingClose = () => {
		if (!outgoing.writableFinished) {
			abortClient();
			recordResult('client_abort');
		}
		cleanup();
	};
	incoming.once('aborted', abortClient);
	incoming.once('close', onIncomingClose);
	outgoing.once('close', onOutgoingClose);
	outgoing.once('finish', cleanup);

	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	return {
		signal: controller.signal,
		get clientAborted() {
			return clientAborted;
		},
		get timedOut() {
			return timedOut;
		},
		clearTimeout: () => clearTimeout(timeout),
		setStatus: (status: number) => {
			statusCode = status;
		},
		receiveUpstream: (upstream: Dispatcher.ResponseData) => {
			clearTimeout(timeout);
			upstreamBody = upstream.body;
			statusCode = upstream.statusCode;
			try {
				recordUpstreamDuration({ ...details, durationMs: Date.now() - details.startedAt });
			} catch {
				// Metrics must never affect proxying.
			}
		},
		recordResult,
	};
}

export type ProxyLifecycle = ReturnType<typeof createProxyLifecycle>;
