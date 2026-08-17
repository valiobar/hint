import { describe, expect, it } from 'vitest';
import { MAX_URLS_PER_REQUEST, validateUrls } from './validate-urls';

describe('validateUrls', () => {
	it.each([
		{
			name: 'valid https',
			input: 'https://support.example.com/reset',
			valid: ['https://support.example.com/reset'],
			rejected: [],
		},
		{
			name: 'not a URL',
			input: 'not-a-url',
			valid: [],
			rejected: [{ value: 'not-a-url', reason: 'Not a valid URL' }],
		},
		{
			name: 'unsupported protocol',
			input: 'ftp://files.example.com/doc',
			valid: [],
			rejected: [
				{
					value: 'ftp://files.example.com/doc',
					reason: 'Only http/https URLs',
				},
			],
		},
		{
			name: 'over the 20-URL limit',
			input: Array.from(
				{ length: MAX_URLS_PER_REQUEST + 1 },
				(_, i) => `https://ok.example/${i}`,
			).join('\n'),
			valid: Array.from(
				{ length: MAX_URLS_PER_REQUEST },
				(_, i) => `https://ok.example/${i}`,
			),
			rejected: [
				{
					value: `https://ok.example/${MAX_URLS_PER_REQUEST}`,
					reason: 'Max 20 URLs per request',
				},
			],
		},
	])('$name', ({ input, valid, rejected }) => {
		expect(validateUrls(input)).toEqual({ valid, rejected });
	});
});
