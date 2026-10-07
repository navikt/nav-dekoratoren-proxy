import { describe, expect, it } from 'vitest';
import { responseHeadersToHeadersMap, stripHopByHopHeaders } from './headers';

describe('headers helpers', () => {
	it('removes hop-by-hop and Connection tokens', () => {
		const headers = new Headers({
			connection: 'keep-alive, custom-token',
			'custom-token': 'remove-me',
			'keep-alive': 'x',
			'content-type': 'text/plain',
			'x-request-id': '123',
		});

		const cleaned = stripHopByHopHeaders(headers);

		expect(cleaned.get('connection')).toBeNull();
		expect(cleaned.get('keep-alive')).toBeNull();
		expect(cleaned.get('custom-token')).toBeNull();
		expect(cleaned.get('content-type')).toBe('text/plain');
		expect(cleaned.get('x-request-id')).toBe('123');
	});

	it('keeps set-cookie headers as repeated values', () => {
		const headers = responseHeadersToHeadersMap({
			'set-cookie': ['a=1', 'b=2'],
			'content-encoding': 'gzip',
			'content-length': '42',
			connection: 'keep-alive',
		});

		expect(headers.get('set-cookie')).toBe('a=1, b=2');
		expect(headers.get('content-encoding')).toBe('gzip');
		expect(headers.get('connection')).toBeNull();
	});
});
