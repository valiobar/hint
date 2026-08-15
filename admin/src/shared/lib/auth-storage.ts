const TOKEN_KEY = 'hint.admin.token';
const EMAIL_KEY = 'hint.admin.email';

export interface StoredSession {
	token: string;
	email: string;
}

export const readSession = (): StoredSession | null => {
	try {
		const token = localStorage.getItem(TOKEN_KEY);
		const email = localStorage.getItem(EMAIL_KEY);
		return token && email ? { token, email } : null;
	} catch {
		return null;
	}
};

export const writeSession = (session: StoredSession): void => {
	try {
		localStorage.setItem(TOKEN_KEY, session.token);
		localStorage.setItem(EMAIL_KEY, session.email);
	} catch {
		// private mode - session simply does not survive a reload
	}
};

export const clearSession = (): void => {
	try {
		localStorage.removeItem(TOKEN_KEY);
		localStorage.removeItem(EMAIL_KEY);
	} catch {
		// nothing to clean up
	}
};
