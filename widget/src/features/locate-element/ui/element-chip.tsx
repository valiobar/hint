import { type MouseEvent } from 'react';
import { findElementByLabel } from '@/features/locate-element/lib/find-element-by-label';
import { flashElement } from '@/features/locate-element/lib/flash-element';
import { performElementAction } from '@/features/locate-element/lib/perform-element-action';
import { PointerClickIcon } from '@/shared/ui/icons';
import styles from '@/features/locate-element/ui/element-chip.module.css';

export const ElementChip = ({ label }: { label: string }) => {
	const handleLocateClick = () => {
		const el = findElementByLabel(label);
		el && flashElement(el);
	};

	const handleActionClick = (event: MouseEvent) => {
		event.stopPropagation();
		const el = findElementByLabel(label);
		if (!el) {
			return;
		}
		flashElement(el);
		performElementAction(el);
	};

	return (
		<span className={styles.wrapper}>
			<button
				type="button"
				className={styles.chip}
				onClick={handleLocateClick}
				data-testid="element-chip"
				aria-label={`Show "${label}" on the page`}
			>
				{label}
			</button>
			<button
				type="button"
				className={styles.action}
				onClick={handleActionClick}
				data-testid="element-chip-action"
				aria-label={`Do "${label}" action`}
			>
				<PointerClickIcon size={16} />
			</button>
		</span>
	);
};
