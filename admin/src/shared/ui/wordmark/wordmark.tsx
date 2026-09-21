import styles from './wordmark.module.css';

interface WordmarkProps {
	size?: 'sm' | 'md';
}

export const Wordmark = ({ size = 'md' }: WordmarkProps) => (
	<span className={`${styles.wordmark} ${styles[size]}`}>
		<span className={styles.mark} aria-hidden="true" />
		hint
	</span>
);
