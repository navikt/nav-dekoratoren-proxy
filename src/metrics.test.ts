import { describe, expect, it } from 'vitest';
import { classifyRoute, classifySource, parseTeamName } from './metrics';

describe('metrics helpers', () => {
	it('classifies source by host', () => {
		expect(classifySource('www.nav.no')).toBe('ingress');
		expect(classifySource('nav-dekoratoren.personbruker')).toBe('service_discovery');
		expect(classifySource('localhost')).toBe('other');
	});

	it('classifies route labels', () => {
		expect(classifyRoute('/dekoratoren/ssr?teamName=a.b')).toBe('ssr');
		expect(classifyRoute('/dekoratoren/header/')).toBe('header');
		expect(classifyRoute('/common-html/v4/navno/header')).toBe('header');
		expect(classifyRoute('/api/search')).toBe('search');
		expect(classifyRoute('/api/notifications/123/archive')).toBe('notifications-archive');
		expect(classifyRoute('/csr/client.js')).toBe('client-asset');
		expect(classifyRoute('/common-html/v4/navno/csr/css/client-app.css')).toBe('client-asset');
		expect(classifyRoute('/dekoratoren/unknown')).toBe('other');
	});

	it('validates teamName only when it matches the format', () => {
		expect(parseTeamName('/dekoratoren/ssr?teamName=a.b')).toBe('a.b');
		expect(parseTeamName('/dekoratoren/ssr?teamName=team')).toBe('unknown');
		expect(parseTeamName('/dekoratoren/ssr?teamName=' + 'a.'.repeat(60) + 'b')).toBe('unknown');
		expect(parseTeamName('/dekoratoren/ssr')).toBe('unknown');
	});
});
