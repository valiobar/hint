import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '@/shared/config';
import styles from './api-status-badge.module.css';

type HealthStatus = 'loading' | 'ok' | 'degraded' | 'error';

export const ApiStatusBadge = () => {
	const [status, setStatus] = useState<HealthStatus>('loading');
	const [detail, setDetail] = useState('checking…');

	const loadHealth = useCallback(async () => {
		try {
			const res = await fetch(`${API_URL}/health`);
			const data = (await res.json()) as {
				status?: string;
				mongo?: string;
				chroma?: string;
			};
			const next = data.status === 'ok' ? 'ok' : 'degraded';
			setStatus(next);
			setDetail(
				`API ${next} · mongo=${data.mongo ?? '?'} · chroma=${data.chroma ?? '?'}`,
			);
		} catch {
			setStatus('error');
			setDetail('API unreachable');
		}
	}, []);

	useEffect(() => {
		void loadHealth();
	}, [loadHealth]);

	return (
		<div className={styles.badge} data-testid="api-status-badge">
			<span
				className={`${styles.dot} ${styles[status]}`}
				aria-hidden="true"
			/>
			<span>{detail}</span>
		</div>
	);
};
