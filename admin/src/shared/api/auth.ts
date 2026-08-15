import { request } from '@/shared/api/http';

export interface LoginResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	email: string;
}

export interface AdminUser {
	email: string;
	created_at: string;
}

export const login = (email: string, password: string): Promise<LoginResponse> =>
	request<LoginResponse>('/api/v1/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});

export const fetchMe = (): Promise<AdminUser> =>
	request<AdminUser>('/api/v1/auth/me');
