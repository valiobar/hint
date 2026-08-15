import { createRoot } from 'react-dom/client';

const PlaceholderBadge = ({ companyId }: { companyId: string }) => (
	<div className="badge" data-testid="hintora-placeholder-badge">
		Hintora · {companyId}
	</div>
);

const mount = () => {
	const config = window.__HINTORA__;
	if (!config || config.mounted) {
		return;
	}
	config.mounted = true;

	const host = document.createElement('div');
	host.id = 'hintora-root';
	host.style.cssText = 'position:fixed;z-index:2147483647;';
	document.body.appendChild(host);

	const shadow = host.attachShadow({ mode: 'open' });
	const style = document.createElement('style');
	style.textContent =
		'.badge{position:fixed;bottom:16px;right:16px;padding:8px 12px;' +
		'border-radius:8px;background:#111;color:#fff;font:12px sans-serif;}';
	shadow.appendChild(style);

	const container = document.createElement('div');
	shadow.appendChild(container);
	createRoot(container).render(<PlaceholderBadge companyId={config.companyId} />);
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', mount);
} else {
	mount();
}
