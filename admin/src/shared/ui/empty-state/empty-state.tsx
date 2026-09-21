import type { ReactNode } from 'react';
import styles from './empty-state.module.css';

interface EmptyStateProps {
	title: string;
	children?: ReactNode;
}

export const EmptyState = ({ title, children }: EmptyStateProps) => (
	<div className={styles.empty} data-testid="empty-state">
		<p className={styles.title}>{title}</p>
		{children ? <p className={styles.body}>{children}</p> : null}
	</div>
);
