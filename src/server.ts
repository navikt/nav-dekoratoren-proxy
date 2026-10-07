import { serve } from '@hono/node-server';
import { loadConfig } from './config';
import { logger } from './logger';
import { createManagementApp } from './management';
import { createProxyApp } from './proxy';

const config = loadConfig(process.env);
let isReady = true;

const { app: proxyApp, agent } = createProxyApp(config);
const managementApp = createManagementApp(() => isReady);

const proxyServer = serve({
	fetch: proxyApp.fetch,
	port: config.port,
});

const managementServer = serve({
	fetch: managementApp.fetch,
	port: config.managementPort,
});

logger.info('Proxy server started', {
	port: config.port,
	managementPort: config.managementPort,
	upstreamUrl: config.upstreamUrl,
});

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	isReady = false;
	const forceExitTimer = setTimeout(() => {
		logger.error('Shutdown exceeded 30 seconds');
		process.exit(1);
	}, 30_000);

	try {
		await new Promise((resolve) => setTimeout(resolve, config.shutdownDelayMs));

		await Promise.all(
			[proxyServer, managementServer].map(
				(server) =>
					new Promise<void>((resolve, reject) => {
						server.close((error) => (error ? reject(error) : resolve()));
					})
			)
		);
		await agent.close();
		clearTimeout(forceExitTimer);
		process.exit(0);
	} catch (error) {
		logger.error('Shutdown failed', error);
		process.exit(1);
	}
};

process.on('SIGINT', () => {
	void shutdown();
});

process.on('SIGTERM', () => {
	void shutdown();
});
