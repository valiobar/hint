import type { Plan } from '@/shared/api/auth';
import { request } from '@/shared/api/http';

export const createCheckout = (
	plan: Plan,
): Promise<{ checkout_url: string }> =>
	request<{ checkout_url: string }>('/api/v1/billing/checkout', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ plan }),
	});

export const getPortalUrl = (): Promise<{ portal_url: string }> =>
	request<{ portal_url: string }>('/api/v1/billing/portal');
