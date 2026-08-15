import { useEffect, useState } from 'react';
import { API_URL } from './config';
import styles from './app.module.css';

type HealthStatus = 'loading' | 'ok' | 'degraded' | 'error';

const ApiStatusBadge = () => {
	const [status, setStatus] = useState<HealthStatus>('loading');
	const [detail, setDetail] = useState<string>('checking…');

	useEffect(() => {
		let cancelled = false;

		const loadHealth = async () => {
			try {
				const res = await fetch(`${API_URL}/health`);
				const data = (await res.json()) as {
					status?: string;
					mongo?: string;
					chroma?: string;
				};
				if (cancelled) {
					return;
				}
				const next = data.status === 'ok' ? 'ok' : 'degraded';
				setStatus(next);
				setDetail(
					`API ${next} · mongo=${data.mongo ?? '?'} · chroma=${data.chroma ?? '?'}`,
				);
			} catch {
				if (cancelled) {
					return;
				}
				setStatus('error');
				setDetail('API unreachable');
			}
		};

		void loadHealth();
		return () => {
			cancelled = true;
		};
	}, []);

	let dotClass = styles.dot;
	if (status === 'ok') {
		dotClass = styles.dotOk;
	} else if (status === 'degraded') {
		dotClass = styles.dotDegraded;
	} else if (status === 'error') {
		dotClass = styles.dotError;
	}

	return (
		<div className={styles.badge} data-testid="api-status-badge">
			<span className={`${styles.dot} ${dotClass}`} aria-hidden="true" />
			<span>{detail}</span>
		</div>
	);
};

export const App = () => (
	<main className={styles.shell}>
		<h1>Hint Admin</h1>
		<p>Company &amp; knowledge-base management arrives in Phase 2.</p>
		<ApiStatusBadge />
	</main>
);
