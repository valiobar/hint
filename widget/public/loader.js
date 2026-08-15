(() => {
	if (window.__HINT__) {
		console.warn('Hint is already initialized on this page');
		return;
	}
	const tag = document.currentScript;
	const companyId = tag && tag.getAttribute('data-hint-company-id');
	if (!companyId) {
		console.error('Hint: data-hint-company-id is required');
		return;
	}
	window.__HINT__ = {
		companyId,
		apiUrl: tag.getAttribute('data-hint-api-url') || 'http://localhost:8000',
	};
	const script = document.createElement('script');
	script.src = new URL('hint-widget.js', tag.src).href;
	script.defer = true;
	document.head.appendChild(script);
})();
