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

export interface UsageSummary {
	period_start: string;
	period_end: string;
	allowance_usd: number; // included in the flat plan; -1 == unlimited
	used_usd: number; // marked-up usage this period
	overage_usd: number; // billed on top of the flat fee
	pricing_tier?: 'peak' | 'offpeak'; // current DeepSeek time-of-use tier
}

export const getUsage = (): Promise<UsageSummary> =>
	request<UsageSummary>('/api/v1/billing/usage');
