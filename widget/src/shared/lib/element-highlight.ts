// Mirrors --hint-accent from variables.css. Host page elements live
// outside the shadow root, so they cannot read the shadow CSS vars.
const HIGHLIGHT_ACCENT = '#4f46e5';
const HIGHLIGHT_ACCENT_RGB = '79 70 229';
const HIGHLIGHT_CLASS = 'hint-element-highlight';
const HIGHLIGHT_STYLE_ID = 'hint-element-highlight-style';

const HIGHLIGHT_CSS = `
.${HIGHLIGHT_CLASS} {
	outline: 2px solid ${HIGHLIGHT_ACCENT} !important;
	outline-offset: 2px !important;
	animation: hint-highlight-pulse 800ms ease-out 2;
}

@keyframes hint-highlight-pulse {
	from {
		box-shadow: 0 0 0 0 rgb(${HIGHLIGHT_ACCENT_RGB} / 0.45);
	}

	to {
		box-shadow: 0 0 0 12px rgb(${HIGHLIGHT_ACCENT_RGB} / 0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.${HIGHLIGHT_CLASS} {
		animation: none;
	}
}
`;

const ensureHighlightStyle = (): void => {
	if (document.getElementById(HIGHLIGHT_STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = HIGHLIGHT_STYLE_ID;
	style.textContent = HIGHLIGHT_CSS;
	document.head.appendChild(style);
};

export const outlineElement = (el: Element): (() => void) => {
	ensureHighlightStyle();
	el.classList.add(HIGHLIGHT_CLASS);
	return () => {
		el.classList.remove(HIGHLIGHT_CLASS);
	};
};
