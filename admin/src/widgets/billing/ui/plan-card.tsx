import type { Plan } from '@/shared/api';
import { Button } from '@/shared/ui';
import styles from './billing.module.css';

interface PlanCardProps {
	id: Plan;
	title: string;
	features: readonly string[];
	current: boolean;
	loading: boolean;
	disabled: boolean;
	onSubscribe: () => void;
}

export const PlanCard = ({
	id,
	title,
	features,
	current,
	loading,
	disabled,
	onSubscribe,
}: PlanCardProps) => (
	<article
		className={current ? styles.cardCurrent : styles.card}
		data-testid={`plan-card-${id}`}
	>
		<header className={styles.cardHead}>
			<h2>{title}</h2>
			{current ? <span className={styles.badge}>Current</span> : null}
		</header>
		<ul className={styles.features}>
			{features.map((feature) => (
				<li key={feature}>{feature}</li>
			))}
		</ul>
		<Button disabled={disabled || loading} onClick={onSubscribe}>
			{loading
				? 'Redirecting…'
				: disabled && current
					? 'Current plan'
					: 'Subscribe'}
		</Button>
	</article>
);
