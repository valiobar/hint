import type { Company } from '@/shared/api';
import styles from './company-list-item.module.css';

interface CompanyListItemProps {
	company: Company;
	isSelected: boolean;
	onSelect: (companyId: string) => void;
}

export const CompanyListItem = ({
	company,
	isSelected,
	onSelect,
}: CompanyListItemProps) => {
	const handleClick = () => onSelect(company.company_id);

	return (
		<button
			type="button"
			className={isSelected ? styles.itemSelected : styles.item}
			onClick={handleClick}
			aria-pressed={isSelected}
			data-testid={`company-item-${company.company_id}`}
		>
			<span className={styles.name}>{company.name}</span>
			<span className={styles.id}>{company.company_id}</span>
		</button>
	);
};
