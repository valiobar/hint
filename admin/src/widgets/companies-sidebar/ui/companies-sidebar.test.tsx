import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Company, Me } from '@/shared/api';
import { useAdminStore } from '@/shared/store/admin-store';
import { CompaniesSidebar } from './companies-sidebar';

const me = (overrides: Partial<Me> = {}): Me => ({
	email: 'ada@example.com',
	role: 'user',
	created_at: '2026-01-01T00:00:00Z',
	plan: 'basic',
	subscription_status: 'active',
	limits: { max_companies: 1, url_ingestion: false },
	...overrides,
});

const company = (id: string): Company => ({
	company_id: id,
	name: id,
	created_at: '2026-01-01T00:00:00Z',
	suggested_questions: [],
});

it('replaces company creation with an upgrade notice at the plan limit', () => {
	useAdminStore.setState({
		me: me(),
		companies: [company('co_1')],
		isLoadingCompanies: false,
		companiesError: null,
		showBilling: false,
	});

	render(<CompaniesSidebar />);

	expect(screen.queryByTestId('create-company-form')).not.toBeInTheDocument();
	expect(screen.getByTestId('company-limit-notice')).toHaveTextContent(
		'Plan limit reached (1 company).',
	);
	fireEvent.click(screen.getByRole('button', { name: 'Upgrade plan' }));
	expect(useAdminStore.getState().showBilling).toBe(true);
});

it('keeps the create form under the limit and hides upgrade on Pro', () => {
	useAdminStore.setState({
		me: me({
			plan: 'pro',
			limits: { max_companies: 10, url_ingestion: true },
		}),
		companies: [company('co_1')],
		isLoadingCompanies: false,
		companiesError: null,
	});

	const { unmount } = render(<CompaniesSidebar />);
	expect(screen.getByTestId('create-company-form')).toBeInTheDocument();
	unmount();

	useAdminStore.setState({
		companies: Array.from({ length: 10 }, (_, index) =>
			company(`co_${index}`),
		),
	});
	render(<CompaniesSidebar />);
	expect(screen.getByTestId('company-limit-notice')).toHaveTextContent(
		'Plan limit reached (10 companies).',
	);
	expect(
		screen.queryByRole('button', { name: 'Upgrade plan' }),
	).not.toBeInTheDocument();
});

it('shows the signed-in email and opens billing from the account block', () => {
	const logout = vi.fn();
	useAdminStore.setState({
		me: me(),
		companies: [],
		isLoadingCompanies: false,
		companiesError: null,
		showBilling: false,
		logout,
	});

	render(<CompaniesSidebar />);

	expect(screen.getByTestId('sidebar-account')).toHaveTextContent(
		'ada@example.com',
	);
	expect(
		screen.getByRole('button', { name: /Switch to (dark|light) theme/ }),
	).toBeInTheDocument();
	expect(screen.getByTestId('plan-pill')).toHaveTextContent('basic · active');
	fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
	expect(useAdminStore.getState().showBilling).toBe(true);

	fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
	expect(logout).toHaveBeenCalled();
});

it('hides billing for a superadmin and asks a new user to subscribe', () => {
	useAdminStore.setState({
		me: me({
			role: 'superadmin',
			plan: null,
			subscription_status: null,
			limits: { max_companies: 10000, url_ingestion: true },
		}),
		companies: [],
		isLoadingCompanies: false,
		companiesError: null,
	});

	const { unmount } = render(<CompaniesSidebar />);
	expect(screen.getByTestId('sidebar-account')).toHaveTextContent(
		'ada@example.com',
	);
	expect(screen.queryByTestId('plan-pill')).not.toBeInTheDocument();
	expect(
		screen.queryByRole('button', { name: 'Billing' }),
	).not.toBeInTheDocument();
	unmount();

	useAdminStore.setState({
		me: me({
			plan: null,
			subscription_status: null,
			limits: { max_companies: 0, url_ingestion: false },
		}),
		companies: [],
	});
	render(<CompaniesSidebar />);
	expect(screen.getByTestId('subscribe-hint')).toHaveTextContent(
		'Subscribe to add a company.',
	);
	expect(screen.getByTestId('plan-pill')).toHaveTextContent('no plan');
});
