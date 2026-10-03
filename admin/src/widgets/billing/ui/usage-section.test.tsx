import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useAdminStore } from '@/shared/store/admin-store';
import { UsageSection } from './usage-section';

it('shows allowance usage and overage', () => {
	useAdminStore.setState({
		usage: {
			period_start: '2026-10-01T00:00:00Z',
			period_end: '2026-10-31T00:00:00Z',
			allowance_usd: 50,
			used_usd: 62.5,
			overage_usd: 12.5,
		},
	});
	render(<UsageSection />);
	expect(screen.getByText('$62.50 / $50.00')).toBeInTheDocument();
	expect(screen.getByTestId('usage-overage')).toHaveTextContent('+$12.50');
});

it('hides overage and clamps unlimited', () => {
	useAdminStore.setState({
		usage: {
			period_start: '2026-10-01T00:00:00Z',
			period_end: '2026-10-31T00:00:00Z',
			allowance_usd: -1,
			used_usd: 3.2,
			overage_usd: 0,
		},
	});
	render(<UsageSection />);
	expect(screen.getByText('$3.20 / Unlimited')).toBeInTheDocument();
	expect(screen.queryByTestId('usage-overage')).toBeNull();
});

it('shows the current pricing tier', () => {
	useAdminStore.setState({
		usage: {
			period_start: '2026-10-01T00:00:00Z',
			period_end: '2026-10-31T00:00:00Z',
			allowance_usd: 50,
			used_usd: 10,
			overage_usd: 0,
			pricing_tier: 'offpeak',
		},
	});
	render(<UsageSection />);
	expect(screen.getByTestId('usage-pricing')).toHaveTextContent('Off-peak pricing');
});

it('renders nothing when usage has not loaded', () => {
	useAdminStore.setState({ usage: null });
	render(<UsageSection />);
	expect(screen.queryByTestId('usage-section')).toBeNull();
});
