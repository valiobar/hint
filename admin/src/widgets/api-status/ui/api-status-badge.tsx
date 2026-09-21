import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '@/shared/config';
import styles from './api-status-badge.module.css';

type HealthStatus = 'loading' | 'ok' | 'degraded' | 'error';

export const ApiStatusBadge = () => {
	const [status, setStatus] = useState<HealthStatus>('loading');
	const [mongo, setMongo] = useState('…');
	const [chroma, setChroma] = useState('…');
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
			const mongoValue = data.mongo ?? '?';
			const chromaValue = data.chroma ?? '?';
			setStatus(next);
			setMongo(mongoValue);
			setChroma(chromaValue);
			setDetail(
				`API ${next} · mongo=${mongoValue} · chroma=${chromaValue}`,
			);
		} catch {
			setStatus('error');
			setMongo('down');
			setChroma('down');
			setDetail('API unreachable');
		}
	}, []);

	useEffect(() => {
		void loadHealth();
	}, [loadHealth]);

	return (
		<div
			className={styles.row}
			data-testid="api-status-badge"
			title={detail}
		>
			<span className={`${styles.chip} ${styles[status]}`}>
				<span className={`${styles.dot} ${styles[status]}`} aria-hidden="true" />
				API {status === 'loading' ? '…' : status}
			</span>
			<span className={styles.chip}>mongo={mongo}</span>
			<span className={styles.chip}>chroma={chroma}</span>
		</div>
	);
};
