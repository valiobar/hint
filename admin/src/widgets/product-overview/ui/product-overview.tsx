import { Button } from '@/shared/ui';
import {
	PRODUCT_FAQ,
	PRODUCT_FEATURES,
	SETUP_STEPS,
	STACK_STATS,
	STACK_SURFACES,
} from '@/widgets/product-overview/lib/features';
import styles from './product-overview.module.css';

const focusCreateCompany = () => {
	document.getElementById('create-company-name')?.focus();
};

export const ProductOverview = () => {
	return (
		<section
			className={styles.overview}
			data-testid="product-overview"
			aria-labelledby="product-overview-title"
		>
			<header className={styles.hero}>
				<p className={styles.kicker}>Hint</p>
				<h2 id="product-overview-title">
					In-app AI guidance grounded in your docs and the live page
				</h2>
				<p className={styles.lead}>
					Hint is an embeddable assistant for SaaS apps. You upload
					the product manual here; customers get a floating guide
					bar in your app that answers questions from those docs
					and the page they are on.
				</p>
				<div className={styles.heroActions}>
					<Button onClick={focusCreateCompany}>Create a company</Button>
					<Button
						variant="ghost"
						onClick={() => {
							document
								.getElementById('product-features')
								?.scrollIntoView({ behavior: 'smooth' });
						}}
					>
						See the features
					</Button>
				</div>
				<p className={styles.cta}>
					Select a company on the left — or create one — to manage
					its knowledge base and copy the embed snippet.
				</p>
			</header>

			<section className={styles.band} aria-labelledby="setup-steps-title">
				<p className={styles.kicker}>Setup</p>
				<h3 id="setup-steps-title">Four steps from admin to the host page</h3>
				<ol className={styles.steps}>
					{SETUP_STEPS.map((step, index) => (
						<li key={step.id} className={styles.step}>
							<span className={styles.index} aria-hidden="true">
								{String(index + 1).padStart(2, '0')}
							</span>
							<h4>{step.title}</h4>
							<p>{step.body}</p>
						</li>
					))}
				</ol>
			</section>

			<section className={styles.band} aria-labelledby="stack-title">
				<p className={styles.kicker}>This stack</p>
				<h3 id="stack-title">What this stack actually is</h3>
				<ul className={styles.stats}>
					{STACK_STATS.map((stat) => (
						<li key={stat.label} className={styles.stat}>
							<p className={styles.statValue}>
								{stat.value}
								<span> {stat.label}</span>
							</p>
							<p>{stat.detail}</p>
						</li>
					))}
				</ul>
				<ul className={styles.surfaces}>
					{STACK_SURFACES.map((surface) => (
						<li key={surface.port} className={styles.surface}>
							<p className={styles.port}>{surface.port}</p>
							<h4>{surface.title}</h4>
							<p>{surface.body}</p>
						</li>
					))}
				</ul>
			</section>

			<section
				className={styles.band}
				id="product-features"
				aria-labelledby="features-title"
			>
				<p className={styles.kicker}>Widget</p>
				<h3 id="features-title">
					Widget features on a per-company knowledge base
				</h3>
				<ul className={styles.features}>
					{PRODUCT_FEATURES.map((feature, index) => (
						<li key={feature.id} className={styles.card}>
							<div className={styles.cardHead}>
								<span className={styles.index} aria-hidden="true">
									{String(index + 1).padStart(2, '0')}
								</span>
								<h4>{feature.title}</h4>
							</div>
							<p className={styles.label}>How it works</p>
							<p>{feature.howItWorks}</p>
							<p className={styles.label}>In the UI</p>
							<p className={styles.access}>{feature.howToAccess}</p>
						</li>
					))}
				</ul>
			</section>

			<section className={styles.band} aria-labelledby="snippet-title">
				<p className={styles.kicker}>Embed</p>
				<h3 id="snippet-title">One loader tag and one company id</h3>
				<p className={styles.sectionLead}>
					The host page does not talk to Admin. It loads the widget
					from the CDN and sends the company id to the public APIs.
				</p>
				<pre className={styles.snippet}>
					{`<script src="{WIDGET_CDN}/embed/v1/loader.js"
        data-hint-company-id="cmp_…"
        data-hint-api-url="{API_URL}" defer></script>`}
				</pre>
			</section>

			<section className={styles.band} aria-labelledby="faq-title">
				<p className={styles.kicker}>From this repo</p>
				<h3 id="faq-title">Straight answers from this repo</h3>
				<ul className={styles.faq}>
					{PRODUCT_FAQ.map((item) => (
						<li key={item.q} className={styles.faqItem}>
							<h4>{item.q}</h4>
							<p>{item.a}</p>
						</li>
					))}
				</ul>
			</section>

			<footer className={styles.footer}>
				<h3>Create a company, upload docs, paste the snippet</h3>
				<p>
					That is the whole operator loop. The widget on the host
					page does the rest.
				</p>
				<Button onClick={focusCreateCompany}>Create a company</Button>
			</footer>
		</section>
	);
};
