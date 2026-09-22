import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
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
