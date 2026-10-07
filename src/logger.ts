export type LogLevel = 'info' | 'warn' | 'error';

function normalizeError(error: unknown): unknown {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
			code: 'code' in error ? (error as { code?: unknown }).code : undefined,
		};
	}

	if (typeof error === 'object' && error !== null) {
		return error;
	}

	return String(error);
}

function emit(level: LogLevel, message: string, metaData?: Record<string, unknown>, error?: unknown): void {
	const payload: Record<string, unknown> = {
		level,
		message,
	};

	if (metaData && Object.keys(metaData).length > 0) {
		payload.metaData = metaData;
	}

	if (error !== undefined) {
		payload.error = normalizeError(error);
	}

	const output = JSON.stringify(payload);
	if (level === 'error') {
		console.error(output);
		return;
	}

	console.log(output);
}

export const logger = {
	info(message: string, metaData?: Record<string, unknown>): void {
		emit('info', message, metaData);
	},
	warn(message: string, metaData?: Record<string, unknown>): void {
		emit('warn', message, metaData);
	},
	error(message: string, error?: unknown, metaData?: Record<string, unknown>): void {
		emit('error', message, metaData, error);
	},
};
