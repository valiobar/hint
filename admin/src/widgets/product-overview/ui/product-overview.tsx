import { PRODUCT_FEATURES } from '@/widgets/product-overview/lib/features';
import styles from './product-overview.module.css';

export const ProductOverview = () => {
	return (
		<section
			className={styles.overview}
			data-testid="product-overview"
			aria-labelledby="product-overview-title"
		>
			<header className={styles.intro}>
				<p className={styles.kicker}>Hint</p>
				<h2 id="product-overview-title">
					In-app guidance from your product docs
				</h2>
				<p className={styles.lead}>
					Hint is an embeddable assistant for SaaS apps. You upload
					the product manual here; customers get a floating guide
					bar in your app that answers questions from those docs
					and the page they are on.
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
