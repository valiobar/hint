import { writeSession } from '@/shared/lib/auth-storage';

export interface AuthCallbackResult {
	sessionWritten: boolean;
	oauthError: string | null;
	checkoutReturn: boolean;
}

export const consumeAuthCallback = (): AuthCallbackResult => {
	const result: AuthCallbackResult = {
		sessionWritten: false,
		oauthError: null,
		checkoutReturn: false,
	};

	const hash = new URLSearchParams(window.location.hash.slice(1));
	const token = hash.get('token');
	const email = hash.get('email');
	if (token && email) {
		writeSession({ token, email });
		result.sessionWritten = true;
	}
	result.oauthError = hash.get('error');

	const query = new URLSearchParams(window.location.search);
	result.checkoutReturn = query.get('checkout') === 'success';

	if (token || result.oauthError || result.checkoutReturn) {
		history.replaceState(null, '', window.location.pathname);
	}
	return result;
};
