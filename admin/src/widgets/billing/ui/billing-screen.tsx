import { useState } from 'react';
import { createCheckout, getPortalUrl } from '@/shared/api';
import type { Plan, SubscriptionStatus } from '@/shared/api';
import { toErrorMessage } from '@/shared/lib/error-message';
import { useAdminStore } from '@/shared/store/admin-store';
import { Button } from '@/shared/ui';
import styles from './billing.module.css';
import { PlanCard } from './plan-card';

const ACTIVE_STATUSES: readonly SubscriptionStatus[] = ['active', 'trialing'];

const PLANS: readonly {
	id: Plan;
	title: string;
	features: readonly string[];
}[] = [
	{
		id: 'basic',
		title: 'Basic',
		features: [
			'1 company',
			'File ingestion (.pdf .md .txt .html)',
			'Chat + hover hints widget',
		],
	},
	{
		id: 'pro',
		title: 'Pro',
		features: [
			'Up to 10 companies',
			'Everything in Basic',
			'URL ingestion (crawl your docs pages)',
		],
	},
];

export const BillingScreen = () => {
	const me = useAdminStore((s) => s.me);
	const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
	const [error, setError] = useState<string | null>(null);

	const subscribe = async (plan: Plan) => {
		setLoadingPlan(plan);
		setError(null);
		try {
			const { checkout_url } = await createCheckout(plan);
			window.location.assign(checkout_url);
		} catch (err) {
			setError(toErrorMessage(err));
			setLoadingPlan(null);
		}
	};

	const openPortal = async () => {
		setError(null);
		try {
			const { portal_url } = await getPortalUrl();
			window.open(portal_url, '_blank', 'noopener');
		} catch (err) {
			setError(toErrorMessage(err));
		}
	};

	const hasSubscription = Boolean(me?.plan);
	const canReturnToPanel =
		me?.subscription_status != null &&
		ACTIVE_STATUSES.includes(me.subscription_status);

	return (
		<section className={styles.screen} data-testid="billing-screen">
			<div className={styles.panel}>
				<p className={styles.kicker}>Billing</p>
				<h1>Choose your plan</h1>
				<p className={styles.lead}>
					You need an active subscription to create companies. Trials included.
				</p>
				{hasSubscription && me?.subscription_status ? (
					<p className={styles.currentPlan}>
						Current plan <strong>{me.plan}</strong>
						<span className={styles.pill} data-status={me.subscription_status}>
							{me.subscription_status.replace(/_/g, ' ')}
						</span>
					</p>
				) : null}
				<div className={styles.cards}>
					{PLANS.map((plan) => {
						const current = me?.plan === plan.id;
						const status = me?.subscription_status;
						const lockedIn =
							current &&
							status != null &&
							ACTIVE_STATUSES.includes(status);
						return (
							<PlanCard
								key={plan.id}
								{...plan}
								current={current}
								loading={loadingPlan === plan.id}
								disabled={lockedIn || loadingPlan !== null}
								onSubscribe={() => void subscribe(plan.id)}
							/>
						);
					})}
				</div>
				{canReturnToPanel || hasSubscription ? (
					<div className={styles.actions}>
						{canReturnToPanel ? (
							<Button
								variant="neutral"
								onClick={() =>
									useAdminStore.setState({ showBilling: false })
								}
							>
								Back to panel
							</Button>
						) : null}
						{hasSubscription ? (
							<Button variant="neutral" onClick={() => void openPortal()}>
								Manage subscription
							</Button>
						) : null}
					</div>
				) : null}
				{error ? (
					<p className={styles.error} role="alert">
						{error}
					</p>
				) : null}
			</div>
		</section>
	);
};
