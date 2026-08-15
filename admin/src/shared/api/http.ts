import { API_URL } from '@/shared/config';
import { clearSession, readSession } from '@/shared/lib/auth-storage';

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly detail: string,
	) {
		super(detail);
		this.name = 'ApiError';
	}
}

const extractDetail = async (response: Response): Promise<string> => {
	try {
		const body = (await response.json()) as { detail?: unknown };
		if (typeof body.detail === 'string') {
			return body.detail;
		}
	} catch {
		// non-JSON error body — fall through to the generic message
	}
	return `Request failed with status ${response.status}`;
};

let onUnauthorized: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: () => void): void => {
	onUnauthorized = handler;
};

const authHeaders = (): Record<string, string> => {
	const session = readSession();
	return session ? { Authorization: `Bearer ${session.token}` } : {};
};

export const request = async <T>(
	path: string,
	init: RequestInit = {},
): Promise<T> => {
	let response: Response;
	try {
		response = await fetch(`${API_URL}${path}`, {
			...init,
			// caller headers win; multipart passes none, so fetch still sets the boundary
			headers: {
				...authHeaders(),
				...(init.headers as Record<string, string> | undefined),
			},
		});
	} catch {
		throw new ApiError(0, 'API unreachable — is the backend running?');
	}
	if (response.status === 401) {
		clearSession();
		onUnauthorized && onUnauthorized();
		throw new ApiError(401, await extractDetail(response));
	}
	if (!response.ok) {
		throw new ApiError(response.status, await extractDetail(response));
	}
	if (response.status === 204) {
		return undefined as T;
	}
	return (await response.json()) as T;
};
