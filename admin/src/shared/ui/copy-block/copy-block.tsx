import { useState } from 'react';
import styles from './copy-block.module.css';

interface CopyBlockProps {
	text: string;
}

export const CopyBlock = ({ text }: CopyBlockProps) => {
	const [isCopied, setIsCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(text);
		setIsCopied(true);
		window.setTimeout(() => setIsCopied(false), 2000);
	};

	return (
		<div className={styles.block} data-testid="copy-block">
			<pre className={styles.code}>{text}</pre>
			<button
				type="button"
				className={styles.copyButton}
				onClick={handleCopy}
			>
				{isCopied ? 'Copied' : 'Copy'}
			</button>
		</div>
	);
};
