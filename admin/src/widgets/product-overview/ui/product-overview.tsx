import { PRODUCT_FEATURES } from '@/widgets/product-overview/lib/features';
import styles from './product-overview.module.css';

export const ProductOverview = () => {
	return (
		<section
			className={styles.overview}
			data-testid="product-overview"
			aria-labelledby="product-overview-title"
		>
			<header className={styles.hero}>
				<p className={styles.kicker}>HINT</p>
				<h2 id="product-overview-title">
					In-app guidance from your product docs
				</h2>
				<p className={styles.lead}>
					Upload the product manual here. Customers get a floating
					guide bar in your app that answers from those docs and the
					page they are on.
				</p>
				<p className={styles.cta}>
					Select a company on the left — or create one — to manage
					its knowledge base and copy the embed snippet.
				</p>
			</header>
			<ul className={styles.features}>
				{PRODUCT_FEATURES.map((feature, index) => (
					<li key={feature.id} className={styles.card}>
						<div className={styles.cardHead}>
							<span className={styles.index} aria-hidden="true">
								{String(index + 1).padStart(2, '0')}
							</span>
							<h3>{feature.title}</h3>
						</div>
						<p className={styles.label}>How it works</p>
						<p>{feature.howItWorks}</p>
						<p className={styles.label}>In the UI</p>
						<p className={styles.access}>{feature.howToAccess}</p>
					</li>
				))}
			</ul>
		</section>
	);
};
