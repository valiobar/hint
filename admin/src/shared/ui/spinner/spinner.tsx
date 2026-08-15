import styles from './spinner.module.css';

export const Spinner = () => (
	<output
		className={styles.spinner}
		aria-label="Loading"
		data-testid="spinner"
	/>
);
