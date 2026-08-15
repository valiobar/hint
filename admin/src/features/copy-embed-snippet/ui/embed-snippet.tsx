import { CopyBlock } from '@/shared/ui';
import { buildEmbedSnippet } from '../lib/build-snippet';
import styles from './embed-snippet.module.css';

interface EmbedSnippetProps {
	companyId: string;
}

export const EmbedSnippet = ({ companyId }: EmbedSnippetProps) => (
	<section className={styles.section} data-testid="embed-snippet">
		<h3>Embed snippet</h3>
		<p>Add this tag to the customer app to activate Hint:</p>
		<CopyBlock text={buildEmbedSnippet(companyId)} />
	</section>
);
