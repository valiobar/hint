interface HintoraGlobal {
	companyId: string;
	apiUrl: string;
	mounted?: boolean;
}

interface Window {
	__HINTORA__?: HintoraGlobal;
}
