import type { UsageSummary } from '@/shared/api';
import { useAdminStore } from '@/shared/store/admin-store';
import styles from './usage.module.css';

const usd = (n: number) => `$${n.toFixed(2)}`;

const pct = (u: UsageSummary) =>
	u.allowance_usd <= 0
		? 0
		: Math.min(100, Math.round((u.used_usd / u.allowance_usd) * 100));

export const UsageSection = () => {
	const usage = useAdminStore((s) => s.usage);
	if (!usage) return null;
	const unlimited = usage.allowance_usd === -1;
	const allowanceLabel = unlimited ? 'Unlimited' : usd(usage.allowance_usd);
	return (
		<div className={styles.section} data-testid="usage-section">
			<h2>Usage this period</h2>
			<div className={styles.row}>
				<span>Included usage</span>
				<span>
					{usd(usage.used_usd)} / {allowanceLabel}
				</span>
				<div className={styles.track}>
					<div className={styles.fill} style={{ width: `${pct(usage)}%` }} />
				</div>
			</div>
			{usage.overage_usd > 0 && (
				<p className={styles.overage} data-testid="usage-overage">
					+{usd(usage.overage_usd)} billed on top of your plan this period
				</p>
			)}
			{usage.pricing_tier && (
				<p className={styles.pricing} data-testid="usage-pricing">
					<span className={styles.tier} data-tier={usage.pricing_tier}>
						{usage.pricing_tier === 'peak' ? 'Peak pricing' : 'Off-peak pricing'}
					</span>
					Usage follows DeepSeek time-of-use rates. Off-peak is half price —
					weekdays outside 01:00–04:00 and 06:00–10:00 UTC, and all weekend.
				</p>
			)}
		</div>
	);
};
