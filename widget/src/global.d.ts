interface HintGlobal {
	companyId: string;
	apiUrl: string;
	mounted?: boolean;
}

interface Window {
	__HINT__?: HintGlobal;
}
