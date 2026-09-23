import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Me } from '@/shared/api';
import { useAdminStore } from '@/shared/store/admin-store';
import { CheckoutPending } from './checkout-pending';

const me = (overrides: Partial<Me> = {}): Me => ({
	email: 'ada@example.com',
	role: 'user',
	created_at: '2026-01-01T00:00:00Z',
	plan: null,
	subscription_status: null,
	limits: { max_companies: 0, url_ingestion: false },
	...overrides,
});

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

it('stops polling and loads companies once the subscription is active', async () => {
	const loadCompanies = vi.fn().mockResolvedValue(undefined);
	const refreshMe = vi
		.fn()
		.mockResolvedValueOnce(me())
		.mockResolvedValue(
			me({
				plan: 'pro',
				subscription_status: 'active',
				limits: { max_companies: 10, url_ingestion: true },
			}),
		);
	useAdminStore.setState({
		checkoutPending: true,
		refreshMe,
		loadCompanies,
	});

	render(<CheckoutPending />);
	expect(screen.getByText('Finalizing your subscription…')).toBeInTheDocument();

	await act(async () => {
		await vi.advanceTimersByTimeAsync(0);
	});
	expect(useAdminStore.getState().checkoutPending).toBe(true);

	await act(async () => {
		await vi.advanceTimersByTimeAsync(2000);
	});
	expect(refreshMe).toHaveBeenCalledTimes(2);
	expect(loadCompanies).toHaveBeenCalledTimes(1);
	expect(useAdminStore.getState().checkoutPending).toBe(false);
});

it('shows the webhook-lag message after about a minute', async () => {
	const refreshMe = vi.fn().mockResolvedValue(me());
	useAdminStore.setState({
		checkoutPending: true,
		refreshMe,
		loadCompanies: vi.fn().mockResolvedValue(undefined),
	});

	render(<CheckoutPending />);

	await act(async () => {
		await vi.advanceTimersByTimeAsync(58_000);
	});

	expect(
		screen.getByText(
			'Payment received — your plan is being activated. Refresh in a minute.',
		),
	).toBeInTheDocument();
	expect(refreshMe).toHaveBeenCalledTimes(30);
});
