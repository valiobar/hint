import styles from './wordmark.module.css';

interface WordmarkProps {
	size?: 'sm' | 'md';
	label?: string;
}

export const Wordmark = ({ size = 'md', label = 'Hint Admin' }: WordmarkProps) => (
	<span className={`${styles.wordmark} ${styles[size]}`}>
		<span className={styles.mark} aria-hidden="true" />
		{label}
	</span>
);
