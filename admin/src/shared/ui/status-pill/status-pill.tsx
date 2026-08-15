import styles from './status-pill.module.css';

interface StatusPillProps {
	status: 'processing' | 'ready' | 'failed' | 'uploading';
}

export const StatusPill = ({ status }: StatusPillProps) => (
	<span
		className={`${styles.pill} ${styles[status]}`}
		data-testid={`status-pill-${status}`}
	>
		{status}
	</span>
);
