(() => {
	if (window.__HINTORA__) {
		console.warn('Hintora is already initialized on this page');
		return;
	}
	const tag = document.currentScript;
	const companyId = tag && tag.getAttribute('data-hintora-company-id');
	if (!companyId) {
		console.error('Hintora: data-hintora-company-id is required');
		return;
	}
	window.__HINTORA__ = {
		companyId,
		apiUrl: tag.getAttribute('data-hintora-api-url') || 'http://localhost:8000',
	};
	const script = document.createElement('script');
	script.src = new URL('hintora-widget.js', tag.src).href;
	script.defer = true;
	document.head.appendChild(script);
})();
