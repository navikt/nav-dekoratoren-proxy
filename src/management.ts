import { Hono } from 'hono';
import { register } from './metrics';

export function createManagementApp(isReady: () => boolean): Hono {
	const app = new Hono();

	app.get('/isAlive', (c) => c.text('OK'));

	app.get('/isReady', (c) => {
		if (!isReady()) {
			return c.text('Service Unavailable', 503);
		}
		return c.text('OK');
	});

	app.get('/metrics', async (c) => {
		const metrics = await register.metrics();
		return c.body(metrics, 200, {
			'content-type': register.contentType,
		});
	});

	return app;
}
