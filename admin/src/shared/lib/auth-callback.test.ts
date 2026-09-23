import { beforeEach, expect, it } from 'vitest';
import { consumeAuthCallback } from './auth-callback';

beforeEach(() => {
	localStorage.clear();
	window.history.replaceState(null, '', '/');
});

it('stores a Google session and scrubs the fragment', () => {
	window.history.replaceState(
		null,
		'',
		'/#token=jwt-1&email=ada%40example.com',
	);
	const result = consumeAuthCallback();
	expect(result).toEqual({
		sessionWritten: true,
		oauthError: null,
		checkoutReturn: false,
	});
	expect(localStorage.getItem('hint.admin.token')).toBe('jwt-1');
	expect(localStorage.getItem('hint.admin.email')).toBe('ada@example.com');
	expect(window.location.hash).toBe('');
	expect(window.location.pathname).toBe('/');
});

it('reports OAuth errors without writing a session', () => {
	window.history.replaceState(null, '', '/#error=oauth_state');
	const result = consumeAuthCallback();
	expect(result.sessionWritten).toBe(false);
	expect(result.oauthError).toBe('oauth_state');
	expect(localStorage.getItem('hint.admin.token')).toBeNull();
	expect(window.location.hash).toBe('');
});

it('flags a Polar checkout return and drops the query', () => {
	window.history.replaceState(null, '', '/?checkout=success');
	const result = consumeAuthCallback();
	expect(result.checkoutReturn).toBe(true);
	expect(result.sessionWritten).toBe(false);
	expect(window.location.search).toBe('');
});

it('leaves an unrelated URL alone', () => {
	window.history.replaceState(null, '', '/?foo=1#bar');
	const result = consumeAuthCallback();
	expect(result).toEqual({
		sessionWritten: false,
		oauthError: null,
		checkoutReturn: false,
	});
	expect(window.location.search).toBe('?foo=1');
	expect(window.location.hash).toBe('#bar');
});
