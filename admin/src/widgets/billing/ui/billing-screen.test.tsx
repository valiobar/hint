import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/shared/api';
import type { Me } from '@/shared/api';
import { useAdminStore } from '@/shared/store/admin-store';
import { BillingScreen } from './billing-screen';

const createCheckout = vi.hoisted(() => vi.fn());
const getPortalUrl = vi.hoisted(() => vi.fn());

vi.mock('@/shared/api', async () => {
	const actual = await vi.importActual<typeof import('@/shared/api')>(
		'@/shared/api',
	);
	return { ...actual, createCheckout, getPortalUrl };
});

const me = (overrides: Partial<Me> = {}): Me => ({
	email: 'ada@example.com',
	role: 'user',
	created_at: '2026-01-01T00:00:00Z',
	plan: null,
	subscription_status: null,
	limits: { max_companies: 0, url_ingestion: false },
	...overrides,
});

it('starts checkout, shows the portal for a current plan, and signs out', async () => {
	const logout = vi.fn();
	useAdminStore.setState({
		me: me({
			plan: 'basic',
			subscription_status: 'trialing',
			limits: { max_companies: 1, url_ingestion: false },
		}),
		logout,
	});
	createCheckout.mockResolvedValue({
		checkout_url: 'https://polar.sh/checkout/pro',
	});
	getPortalUrl.mockResolvedValue({
		portal_url: 'https://polar.sh/portal/1',
	});
	const assign = vi.fn();
	vi.stubGlobal('location', { ...window.location, assign });
	const open = vi.spyOn(window, 'open').mockImplementation(() => null);

	render(<BillingScreen />);

	expect(screen.getByText('trialing')).toBeInTheDocument();
	expect(screen.getByTestId('plan-card-basic')).toHaveTextContent('Current plan');
	expect(
		screen.getByRole('button', { name: 'Current plan' }),
	).toBeDisabled();

	fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
	await waitFor(() => {
		expect(createCheckout).toHaveBeenCalledWith('pro');
	});
	expect(assign).toHaveBeenCalledWith('https://polar.sh/checkout/pro');

	fireEvent.click(screen.getByRole('button', { name: 'Manage subscription' }));
	await waitFor(() => {
		expect(getPortalUrl).toHaveBeenCalled();
	});
	expect(open).toHaveBeenCalledWith(
		'https://polar.sh/portal/1',
		'_blank',
		'noopener',
	);

	fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
	expect(logout).toHaveBeenCalled();

	open.mockRestore();
	vi.unstubAllGlobals();
});

it('hides the portal until a plan exists and shows checkout errors', async () => {
	useAdminStore.setState({ me: me(), logout: vi.fn() });
	createCheckout.mockRejectedValue(new ApiError(503, 'Polar is not configured'));

	render(<BillingScreen />);

	expect(
		screen.queryByRole('button', { name: 'Manage subscription' }),
	).not.toBeInTheDocument();
	expect(
		screen.queryByRole('button', { name: 'Back to panel' }),
	).not.toBeInTheDocument();

	fireEvent.click(screen.getAllByRole('button', { name: 'Subscribe' })[0]);
	expect(await screen.findByRole('alert')).toHaveTextContent(
		'Polar is not configured',
	);
});

it('returns to the panel when the subscription is already active', () => {
	useAdminStore.setState({
		me: me({
			plan: 'pro',
			subscription_status: 'active',
			limits: { max_companies: 10, url_ingestion: true },
		}),
		showBilling: true,
		logout: vi.fn(),
	});

	render(<BillingScreen />);
	fireEvent.click(screen.getByRole('button', { name: 'Back to panel' }));
	expect(useAdminStore.getState().showBilling).toBe(false);
});
