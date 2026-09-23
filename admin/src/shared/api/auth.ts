import { API_URL } from '@/shared/config';
import { request } from '@/shared/api/http';

export interface LoginResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	email: string;
}

export type Role = 'superadmin' | 'user';
export type Plan = 'basic' | 'pro';
export type SubscriptionStatus =
	| 'trialing'
	| 'active'
	| 'canceled'
	| 'revoked'
	| 'past_due';

export interface PlanLimits {
	max_companies: number;
	url_ingestion: boolean;
}

export interface Me {
	email: string;
	role: Role;
	created_at: string;
	plan: Plan | null;
	subscription_status: SubscriptionStatus | null;
	limits: PlanLimits;
}

export const login = (email: string, password: string): Promise<LoginResponse> =>
	request<LoginResponse>('/api/v1/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});

export const register = (
	email: string,
	password: string,
): Promise<LoginResponse> =>
	request<LoginResponse>('/api/v1/auth/register', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});

export const fetchMe = (): Promise<Me> => request<Me>('/api/v1/auth/me');

/** Full-page navigation to the Google OAuth start route — not a fetch. */
export const googleLoginUrl = (): string =>
	`${API_URL}/api/v1/auth/google/login`;
