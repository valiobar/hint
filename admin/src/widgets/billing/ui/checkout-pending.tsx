import { useEffect, useState } from 'react';
import { useAdminStore } from '@/shared/store/admin-store';
import { Spinner } from '@/shared/ui';
import styles from './billing.module.css';

const MAX_ATTEMPTS = 30;
const POLL_MS = 2000;

export const CheckoutPending = () => {
	const refreshMe = useAdminStore((s) => s.refreshMe);
	const [timedOut, setTimedOut] = useState(false);

	useEffect(() => {
		let attempts = 0;
		let stopped = false;
		let inFlight = false;
		let timer: ReturnType<typeof setInterval> | undefined;

		const poll = async () => {
			if (stopped || inFlight) {
				return;
			}
			inFlight = true;
			attempts += 1;
			try {
				const me = await refreshMe();
				if (stopped) {
					return;
				}
				const status = me?.subscription_status;
				const active = status === 'active' || status === 'trialing';
				if (active) {
					stopped = true;
					clearInterval(timer);
					useAdminStore.setState({ checkoutPending: false });
					await useAdminStore.getState().loadCompanies();
					return;
				}
				if (attempts >= MAX_ATTEMPTS) {
					stopped = true;
					clearInterval(timer);
					setTimedOut(true);
				}
			} finally {
				inFlight = false;
			}
		};

		void poll();
		timer = setInterval(() => {
			void poll();
		}, POLL_MS);

		return () => {
			stopped = true;
			clearInterval(timer);
		};
	}, [refreshMe]);

	if (timedOut) {
		return (
			<section className={styles.pendingScreen} data-testid="checkout-pending">
				<p className={styles.timeout}>
					Payment received — your plan is being activated. Refresh in a minute.
				</p>
			</section>
		);
	}

	return (
		<section className={styles.pendingScreen} data-testid="checkout-pending">
			<div className={styles.pending}>
				<Spinner />
				<p>Finalizing your subscription…</p>
			</div>
		</section>
	);
};
