# Phase 2 — Admin Panel (Detailed Implementation Plan)

> Parent plan: `plans/hint_poc_implementation.md` (Phase 2, Steps 2.1–2.2).
> Docs reviewed: `docs/01-architecture-overview.md` (compose map, env vars, embed
> contract, admin build args), `docs/02-backend.md` (all API contracts consumed here).
> Goal: turn the Phase 0 admin shell into a full admin panel — create companies,
> upload documents with per-file status, delete documents, copy the embed snippet —
> built with **strict FSD architecture** (`app → widgets → features → entities → shared`).

## Overview

Phase 2 replaces the flat Phase 0 admin shell (`admin/src/app.tsx` health badge) with a
feature-complete single-page admin panel:

- **Layout**: two-pane. Left: company list + "create company" form. Right: selected
  company detail (embed snippet, document upload, document list with delete).
- **FSD layering**: `app/ → widgets/ → features/ → entities/ → shared/`, top-down
  imports only. Features never import from other features — all cross-feature state
  flows through a Zustand store in `shared/store/` (workspace rule).
- **State**: one Zustand store (`admin-store.ts`) holding companies, selection,
  documents, upload progress, and error strings. Async actions call the API layer in
  `shared/api/` (typed `request<T>()` wrapper + endpoint functions matching
  `docs/02-backend.md` exactly).
- **Validation**: Zod schema for the create-company form (1–100 chars, mirrors the
  backend's `CompanyCreate` constraints); client-side pre-checks for uploads
  (accepted extensions, 10 MB cap) so doomed requests never leave the browser.
- **Upload UX**: ingestion is synchronous server-side, so the client shows an
  "uploading" row per file during the request; the response carries final
  `ready` / `failed` statuses (with error reason) which replace the placeholder rows.
- **Embed snippet**: built from `VITE_WIDGET_CDN_URL` + `VITE_API_URL` using the
  documented contract — `{CDN}/embed/v1/loader.js`, `data-hint-company-id`,
  `data-hint-api-url` — with a one-click copy block.

Code style follows the existing admin shell: tabs, single quotes, semicolons,
CSS modules, kebab-case filenames, named exports, `handle*` event handlers,
`data-testid` attributes, absolute imports via a new `@/` alias.

**Exit criteria** (from the parent plan): full admin flow works in a browser —
create a company, upload 3 files, see them "ready", copy the snippet.

## Pros / Cons

**Pros**

- Strict FSD gives the same architecture vocabulary as the future widget (Phase 4) and
  the reference marketing-player project — layers, slices, and public `index.ts` APIs
  are consistent across the codebase.
- A single Zustand store in `shared/store/` keeps cross-feature communication legal
  under FSD (features import shared, never each other) and makes the selected-company →
  documents flow trivial to reason about.
- The API layer is a 1:1 mapping of `docs/02-backend.md` contracts with a typed
  `ApiError` that surfaces backend `detail` strings — the 503 "OPENAI_API_KEY is not
  configured" message reaches the user verbatim and actionably.
- Client-side pre-validation (extension whitelist, 10 MB cap) mirrors server rules, so
  the common failure modes are caught instantly without a network round-trip.
- No new heavyweight dependencies: only `zod` (planned in the parent plan) and
  `zustand` (mandated by the workspace state rule). Drag-and-drop uses native DOM
  events — no dropzone library.

**Cons / accepted trade-offs**

- No auth on the admin panel (parent-plan POC decision; Phase 6 hardening item).
- No admin unit tests in this phase — the parent plan's testing checklist covers
  backend and widget tests only; the admin exit gate is a manual browser walkthrough.
- FSD is heavier than a 5-file SPA strictly needs; accepted for consistency with the
  workspace rules and to rehearse the structure the Phase 4 widget will use.
- Upload progress is binary (uploading → done) — no per-byte progress bar, since
  `fetch` uploads don't expose progress without streams plumbing; fine for POC file sizes.
- The store is a single global instance (not per-runtime like marketing-player) —
  correct here because the admin page is a singleton SPA, not an embeddable component.

## Current State Analysis

### ✅ Existing (Phase 0)

- `admin/` Vite + React 18 + TS app builds and ships via multi-stage Dockerfile
  (node:22-alpine + pnpm → nginx), exposed on :3001.
- `admin/src/config.ts` — `API_URL` / `WIDGET_CDN_URL` from `VITE_*` env (baked at
  build time via compose build args).
- `admin/src/app.tsx` — shell page with an API health badge (`GET /health`).
- `admin/src/main.tsx` — standard `createRoot` bootstrap with `StrictMode`.
- Backend endpoints are live and documented (`docs/02-backend.md`): companies CRUD,
  multi-file upload with per-file `ready`/`failed` status, list/delete documents.

### ❌ Missing Components (all of Phase 2)

- ❌ `zod` + `zustand` dependencies, `@/` path alias, FSD folder scaffold — Step 1
- ❌ `shared/config/`, `shared/api/` (http wrapper, types, endpoints) — Step 2
- ❌ `shared/store/admin-store.ts` (Zustand) — Step 3
- ❌ `shared/ui/` primitives + design tokens, `shared/lib/` helpers — Step 4
- ❌ `entities/company/`, `entities/document/` presentational components — Step 5
- ❌ `features/create-company/` (Zod form) — Step 6
- ❌ `features/upload-documents/` (drag-and-drop dropzone) — Step 7
- ❌ `features/delete-document/`, `features/copy-embed-snippet/` — Step 8
- ❌ `widgets/companies-sidebar/`, `widgets/company-detail/`, `widgets/api-status/` — Step 9
- ❌ `app/` composition root; removal of the flat Phase 0 shell files — Step 10
- ❌ Build + Docker + browser verification of exit criteria — Step 11
- ❌ `docs/04-admin.md`, overview/README updates, parent plan checkmarks — Step 12

### Target FSD structure

```
admin/src/
├── app/
│   ├── app.tsx  + app.module.css      # two-pane layout composition root
│   └── styles/global.css              # reset, body styles, imports variables.css
├── widgets/
│   ├── companies-sidebar/             # company list + create-company feature
│   ├── company-detail/                # snippet + upload + document list + delete
│   └── api-status/                    # migrated health badge
├── features/
│   ├── create-company/                # model/schema.ts (Zod) + ui form
│   ├── upload-documents/              # lib/validate-files.ts + ui dropzone
│   ├── delete-document/               # ui delete button (confirm + store action)
│   └── copy-embed-snippet/            # lib/build-snippet.ts + ui embed-snippet
├── entities/
│   ├── company/                       # ui/company-list-item.tsx
│   └── document/                      # ui/document-row.tsx
├── shared/
│   ├── api/                           # http.ts, types.ts, companies.ts, documents.ts
│   ├── config/                        # index.ts (API_URL, WIDGET_CDN_URL)
│   ├── store/admin-store.ts           # Zustand: all cross-feature state
│   ├── ui/                            # button, text-input, status-pill, copy-block, spinner
│   │   └── styles/variables.css       # design tokens (CSS custom properties)
│   └── lib/                           # format-bytes.ts, error-message.ts
└── main.tsx
```

Every slice exposes a public `index.ts`; upper layers import only from those
(e.g. `@/features/create-company`, never `@/features/create-company/ui/...`).

---

## Implementation Steps

### Step 1: Dependencies, `@/` alias, FSD scaffold

**File(s)**: `admin/package.json`, `admin/pnpm-lock.yaml`, `admin/tsconfig.json`,
`admin/vite.config.ts`

**Changes**:
- `pnpm add zod zustand` (latest; regenerates the lockfile the Docker build needs).
- Add `@/* → src/*` path alias to `tsconfig.json` and a matching `resolve.alias` to
  `vite.config.ts`.
- Create the FSD directories (they fill up in Steps 2–10).

**Pseudo-code**:

```bash
cd admin
pnpm add zod zustand
mkdir -p src/app/styles src/widgets src/features src/entities \
	src/shared/{api,config,store,ui/styles,lib}
```

```jsonc
// admin/tsconfig.json — add under compilerOptions
{
	"baseUrl": ".",
	"paths": { "@/*": ["src/*"] }
}
```

```typescript
// admin/vite.config.ts
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
	},
});
```

### Step 2: Shared config + API layer

**File(s)**: `admin/src/shared/config/index.ts`, `admin/src/shared/api/types.ts`,
`admin/src/shared/api/http.ts`, `admin/src/shared/api/companies.ts`,
`admin/src/shared/api/documents.ts`, `admin/src/shared/api/index.ts`

**Changes**:
- Move `src/config.ts` content into `shared/config/index.ts` (deleted in Step 10).
- `types.ts`: wire contracts from `docs/02-backend.md` — `Company`, `DocumentMeta`,
  `DocumentStatus`.
- `http.ts`: `request<T>()` fetch wrapper that throws a typed `ApiError` carrying the
  HTTP status and the backend `detail` string (404 unknown company, 413 file too big,
  422 validation, 503 missing OpenAI key); network failures become `ApiError(0, …)`.
- Endpoint functions: `listCompanies`, `createCompany`, `listDocuments`,
  `uploadDocuments` (multipart, repeated `files` field — no manual `Content-Type` so
  the browser sets the boundary), `deleteDocument` (204 → `void`).

**Pseudo-code**:

```typescript
// admin/src/shared/config/index.ts
export const API_URL: string =
	import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
export const WIDGET_CDN_URL: string =
	import.meta.env.VITE_WIDGET_CDN_URL ?? 'http://localhost:1337';
```

```typescript
// admin/src/shared/api/types.ts
export interface Company {
	company_id: string;
	name: string;
	created_at: string;
}

export type DocumentStatus = 'processing' | 'ready' | 'failed';

export interface DocumentMeta {
	document_id: string;
	company_id: string;
	filename: string;
	size_bytes: number;
	chunk_count: number;
	status: DocumentStatus;
	error: string | null;
	created_at: string;
}
```

```typescript
// admin/src/shared/api/http.ts
import { API_URL } from '@/shared/config';

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly detail: string,
	) {
		super(detail);
		this.name = 'ApiError';
	}
}

const extractDetail = async (response: Response): Promise<string> => {
	try {
		const body = (await response.json()) as { detail?: unknown };
		if (typeof body.detail === 'string') {
			return body.detail;
		}
	} catch {
		// non-JSON error body — fall through to the generic message
	}
	return `Request failed with status ${response.status}`;
};

export const request = async <T>(
	path: string,
	init: RequestInit = {},
): Promise<T> => {
	let response: Response;
	try {
		response = await fetch(`${API_URL}${path}`, init);
	} catch {
		throw new ApiError(0, 'API unreachable — is the backend running?');
	}
	if (!response.ok) {
		throw new ApiError(response.status, await extractDetail(response));
	}
	if (response.status === 204) {
		return undefined as T;
	}
	return (await response.json()) as T;
};
```

```typescript
// admin/src/shared/api/companies.ts
import { request } from '@/shared/api/http';
import { Company } from '@/shared/api/types';

export const listCompanies = (): Promise<Company[]> =>
	request<Company[]>('/api/v1/companies');

export const createCompany = (name: string): Promise<Company> =>
	request<Company>('/api/v1/companies', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name }),
	});
```

```typescript
// admin/src/shared/api/documents.ts
import { request } from '@/shared/api/http';
import { DocumentMeta } from '@/shared/api/types';

export const listDocuments = (companyId: string): Promise<DocumentMeta[]> =>
	request<DocumentMeta[]>(`/api/v1/companies/${companyId}/documents`);

export const uploadDocuments = (
	companyId: string,
	files: File[],
): Promise<DocumentMeta[]> => {
	const form = new FormData();
	files.forEach((file) => form.append('files', file));
	return request<DocumentMeta[]>(
		`/api/v1/companies/${companyId}/documents`,
		{ method: 'POST', body: form },
	);
};

export const deleteDocument = (
	companyId: string,
	documentId: string,
): Promise<void> =>
	request<void>(
		`/api/v1/companies/${companyId}/documents/${documentId}`,
		{ method: 'DELETE' },
	);
```

```typescript
// admin/src/shared/api/index.ts
export { ApiError, request } from '@/shared/api/http';
export * from '@/shared/api/types';
export { listCompanies, createCompany } from '@/shared/api/companies';
export { listDocuments, uploadDocuments, deleteDocument } from '@/shared/api/documents';
```

### Step 3: Zustand admin store

**File(s)**: `admin/src/shared/store/admin-store.ts`, `admin/src/shared/lib/error-message.ts`

**Changes**:
- Single global store (the admin page is a singleton SPA — no per-instance runtime
  needed). State and async actions co-located; actions call `shared/api` and update
  loading/error flags explicitly.
- `createCompany` appends and auto-selects the new company; `selectCompany` resets
  document state and loads the list; `uploadDocuments` shows placeholder rows while
  the request is in flight, then reloads the document list; `deleteDocument` removes
  optimistically after the 204.
- `toErrorMessage` helper converts `ApiError` → its `detail`, everything else → a
  generic message (never a silent catch).

**Pseudo-code**:

```typescript
// admin/src/shared/lib/error-message.ts
import { ApiError } from '@/shared/api';

export const toErrorMessage = (err: unknown): string => {
	if (err instanceof ApiError) {
		return err.detail;
	}
	if (err instanceof Error) {
		return err.message;
	}
	return 'Unexpected error';
};
```

```typescript
// admin/src/shared/store/admin-store.ts
import { create } from 'zustand';
import {
	Company, DocumentMeta,
	listCompanies, createCompany as apiCreateCompany,
	listDocuments, uploadDocuments as apiUploadDocuments,
	deleteDocument as apiDeleteDocument,
} from '@/shared/api';
import { toErrorMessage } from '@/shared/lib/error-message';

export interface UploadingFile {
	name: string;
	sizeBytes: number;
}

interface AdminState {
	companies: Company[];
	isLoadingCompanies: boolean;
	companiesError: string | null;
	selectedCompanyId: string | null;
	documents: DocumentMeta[];
	isLoadingDocuments: boolean;
	documentsError: string | null;
	uploadingFiles: UploadingFile[];
	uploadError: string | null;
	loadCompanies: () => Promise<void>;
	createCompany: (name: string) => Promise<void>;
	selectCompany: (companyId: string) => Promise<void>;
	loadDocuments: () => Promise<void>;
	uploadDocuments: (files: File[]) => Promise<void>;
	deleteDocument: (documentId: string) => Promise<void>;
}

export const useAdminStore = create<AdminState>()((set, get) => ({
	companies: [],
	isLoadingCompanies: false,
	companiesError: null,
	selectedCompanyId: null,
	documents: [],
	isLoadingDocuments: false,
	documentsError: null,
	uploadingFiles: [],
	uploadError: null,

	loadCompanies: async () => {
		set({ isLoadingCompanies: true, companiesError: null });
		try {
			set({ companies: await listCompanies() });
		} catch (err) {
			set({ companiesError: toErrorMessage(err) });
		} finally {
			set({ isLoadingCompanies: false });
		}
	},

	createCompany: async (name) => {
		const company = await apiCreateCompany(name);   // form catches + renders errors
		set((s) => ({ companies: [company, ...s.companies] }));
		await get().selectCompany(company.company_id);
	},

	selectCompany: async (companyId) => {
		set({
			selectedCompanyId: companyId,
			documents: [],
			documentsError: null,
			uploadError: null,
		});
		await get().loadDocuments();
	},

	loadDocuments: async () => {
		const companyId = get().selectedCompanyId;
		if (!companyId) {
			return;
		}
		set({ isLoadingDocuments: true, documentsError: null });
		try {
			set({ documents: await listDocuments(companyId) });
		} catch (err) {
			set({ documentsError: toErrorMessage(err) });
		} finally {
			set({ isLoadingDocuments: false });
		}
	},

	uploadDocuments: async (files) => {
		const companyId = get().selectedCompanyId;
		if (!companyId || files.length === 0) {
			return;
		}
		set({
			uploadError: null,
			uploadingFiles: files.map((f) => ({ name: f.name, sizeBytes: f.size })),
		});
		try {
			await apiUploadDocuments(companyId, files);
			await get().loadDocuments();       // response rows are also in the fresh list
		} catch (err) {
			set({ uploadError: toErrorMessage(err) });
		} finally {
			set({ uploadingFiles: [] });
		}
	},

	deleteDocument: async (documentId) => {
		const companyId = get().selectedCompanyId;
		if (!companyId) {
			return;
		}
		try {
			await apiDeleteDocument(companyId, documentId);
			set((s) => ({
				documents: s.documents.filter((d) => d.document_id !== documentId),
			}));
		} catch (err) {
			set({ documentsError: toErrorMessage(err) });
		}
	},
}));
```

### Step 4: Shared UI primitives + design tokens + helpers

**File(s)**: `admin/src/shared/ui/styles/variables.css`, `admin/src/app/styles/global.css`,
`admin/src/shared/ui/button/button.tsx` (+ `.module.css`),
`admin/src/shared/ui/text-input/text-input.tsx` (+ `.module.css`),
`admin/src/shared/ui/status-pill/status-pill.tsx` (+ `.module.css`),
`admin/src/shared/ui/copy-block/copy-block.tsx` (+ `.module.css`),
`admin/src/shared/ui/spinner/spinner.tsx` (+ `.module.css`),
`admin/src/shared/ui/index.ts`, `admin/src/shared/lib/format-bytes.ts`

**Changes**:
- Design tokens as CSS custom properties (colors from the existing Phase 0 palette,
  spacing, radius, fonts); `global.css` holds the reset + body styles and imports the
  variables file.
- Five small primitives, each in its own kebab-case folder with a CSS module.
- `CopyBlock` uses `navigator.clipboard.writeText` with a 2 s "Copied" confirmation.
- `formatBytes` for document sizes (`482133 → "471 KB"`).

**Pseudo-code**:

```css
/* admin/src/shared/ui/styles/variables.css */
:root {
	--color-bg: #f0f2f5;
	--color-surface: #ffffff;
	--color-text: #111827;
	--color-text-muted: #4b5563;
	--color-border: #e5e7eb;
	--color-accent: #2563eb;
	--color-ok: #15803d;
	--color-warn: #c2410c;
	--color-error: #b91c1c;
	--font-sans: 'IBM Plex Sans', 'Segoe UI', sans-serif;
	--font-mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
	--space-1: 0.25rem;
	--space-2: 0.5rem;
	--space-3: 1rem;
	--space-4: 1.5rem;
	--radius: 0.5rem;
}
```

```tsx
// admin/src/shared/ui/copy-block/copy-block.tsx
import { useState } from 'react';
import styles from './copy-block.module.css';

interface CopyBlockProps {
	text: string;
}

export const CopyBlock = ({ text }: CopyBlockProps) => {
	const [isCopied, setIsCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(text);
		setIsCopied(true);
		window.setTimeout(() => setIsCopied(false), 2000);
	};

	return (
		<div className={styles.block} data-testid="copy-block">
			<pre className={styles.code}>{text}</pre>
			<button type="button" className={styles.copyButton} onClick={handleCopy}>
				{isCopied ? 'Copied' : 'Copy'}
			</button>
		</div>
	);
};
```

```tsx
// admin/src/shared/ui/status-pill/status-pill.tsx
import styles from './status-pill.module.css';

interface StatusPillProps {
	status: 'processing' | 'ready' | 'failed' | 'uploading';
}

export const StatusPill = ({ status }: StatusPillProps) => (
	<span
		className={`${styles.pill} ${styles[status]}`}
		data-testid={`status-pill-${status}`}
	>
		{status}
	</span>
);
```

```typescript
// admin/src/shared/lib/format-bytes.ts
export const formatBytes = (bytes: number): string => {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${Math.round(bytes / 1024)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
```

```typescript
// admin/src/shared/ui/index.ts
export { Button } from '@/shared/ui/button/button';
export { TextInput } from '@/shared/ui/text-input/text-input';
export { StatusPill } from '@/shared/ui/status-pill/status-pill';
export { CopyBlock } from '@/shared/ui/copy-block/copy-block';
export { Spinner } from '@/shared/ui/spinner/spinner';
```

### Step 5: Entities — company + document presentational components

**File(s)**: `admin/src/entities/company/ui/company-list-item.tsx` (+ `.module.css`),
`admin/src/entities/company/index.ts`,
`admin/src/entities/document/ui/document-row.tsx` (+ `.module.css`),
`admin/src/entities/document/index.ts`

**Changes**:
- Pure presentational components typed against `shared/api` types — no store access,
  no feature imports (entities sit below features).
- `DocumentRow` accepts an `actions` slot (`ReactNode`) so the delete-document feature
  can be injected by the widget without an entity→feature import.
- Failed documents render the backend `error` reason inline.

**Pseudo-code**:

```tsx
// admin/src/entities/company/ui/company-list-item.tsx
import { Company } from '@/shared/api';
import styles from './company-list-item.module.css';

interface CompanyListItemProps {
	company: Company;
	isSelected: boolean;
	onSelect: (companyId: string) => void;
}

export const CompanyListItem = ({ company, isSelected, onSelect }: CompanyListItemProps) => {
	const handleClick = () => onSelect(company.company_id);

	return (
		<button
			type="button"
			className={isSelected ? styles.itemSelected : styles.item}
			onClick={handleClick}
			data-testid={`company-item-${company.company_id}`}
		>
			<span className={styles.name}>{company.name}</span>
			<span className={styles.id}>{company.company_id}</span>
		</button>
	);
};
```

```tsx
// admin/src/entities/document/ui/document-row.tsx
import { ReactNode } from 'react';
import { DocumentMeta } from '@/shared/api';
import { StatusPill } from '@/shared/ui';
import { formatBytes } from '@/shared/lib/format-bytes';
import styles from './document-row.module.css';

interface DocumentRowProps {
	document: DocumentMeta;
	actions?: ReactNode;
}

export const DocumentRow = ({ document, actions }: DocumentRowProps) => (
	<li className={styles.row} data-testid={`document-row-${document.document_id}`}>
		<div className={styles.main}>
			<span className={styles.filename}>{document.filename}</span>
			<span className={styles.meta}>
				{formatBytes(document.size_bytes)} · {document.chunk_count} chunks
			</span>
			{document.status === 'failed' && document.error && (
				<span className={styles.error}>{document.error}</span>
			)}
		</div>
		<StatusPill status={document.status} />
		{actions}
	</li>
);
```

### Step 6: Feature — create-company (Zod form)

**File(s)**: `admin/src/features/create-company/model/schema.ts`,
`admin/src/features/create-company/ui/create-company-form.tsx` (+ `.module.css`),
`admin/src/features/create-company/index.ts`

**Changes**:
- Zod schema mirrors the backend constraint (`name`: trimmed, 1–100 chars).
- Controlled form; on submit: validate → `store.createCompany` (which auto-selects) →
  clear the input. API errors render inline (e.g. 422 from the backend).

**Pseudo-code**:

```typescript
// admin/src/features/create-company/model/schema.ts
import { z } from 'zod';

export const createCompanySchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Company name is required')
		.max(100, 'Company name must be at most 100 characters'),
});
```

```tsx
// admin/src/features/create-company/ui/create-company-form.tsx
import { FormEvent, useState } from 'react';
import { useAdminStore } from '@/shared/store/admin-store';
import { toErrorMessage } from '@/shared/lib/error-message';
import { Button, TextInput } from '@/shared/ui';
import { createCompanySchema } from '../model/schema';
import styles from './create-company-form.module.css';

export const CreateCompanyForm = () => {
	const createCompany = useAdminStore((s) => s.createCompany);
	const [name, setName] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const parsed = createCompanySchema.safeParse({ name });
		if (!parsed.success) {
			setError(parsed.error.issues[0].message);
			return;
		}
		setError(null);
		setIsSubmitting(true);
		try {
			await createCompany(parsed.data.name);
			setName('');
		} catch (err) {
			setError(toErrorMessage(err));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form className={styles.form} onSubmit={handleSubmit} data-testid="create-company-form">
			<TextInput
				value={name}
				onChange={setName}
				placeholder="Company name"
				aria-label="Company name"
			/>
			<Button type="submit" disabled={isSubmitting}>
				{isSubmitting ? 'Creating…' : 'Create company'}
			</Button>
			{error && <p className={styles.error} role="alert">{error}</p>}
		</form>
	);
};
```

### Step 7: Feature — upload-documents (drag-and-drop dropzone)

**File(s)**: `admin/src/features/upload-documents/lib/validate-files.ts`,
`admin/src/features/upload-documents/ui/file-dropzone.tsx` (+ `.module.css`),
`admin/src/features/upload-documents/index.ts`

**Changes**:
- Client-side pre-checks mirroring the server (`docs/02-backend.md`): extension
  whitelist `.pdf/.md/.txt/.html/.htm`, 10 MB per-file cap. Rejected files show a
  local reason immediately; valid files go to `store.uploadDocuments` in one batch
  (one bad file server-side never fails the batch — per-file status comes back).
- Native drag-and-drop (`dragover`/`dragleave`/`drop`) + a hidden file input for
  click-to-pick. During upload, the widget (Step 9) renders `uploadingFiles` from the
  store as placeholder rows.

**Pseudo-code**:

```typescript
// admin/src/features/upload-documents/lib/validate-files.ts
const ACCEPTED_EXTENSIONS = ['.pdf', '.md', '.txt', '.html', '.htm'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export interface RejectedFile {
	name: string;
	reason: string;
}

export interface ValidationResult {
	valid: File[];
	rejected: RejectedFile[];
}

export const validateFiles = (files: File[]): ValidationResult => {
	const valid: File[] = [];
	const rejected: RejectedFile[] = [];
	files.forEach((file) => {
		const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
		if (!ACCEPTED_EXTENSIONS.includes(ext)) {
			rejected.push({ name: file.name, reason: `Unsupported file type: ${ext}` });
		} else if (file.size > MAX_FILE_SIZE_BYTES) {
			rejected.push({ name: file.name, reason: 'File exceeds 10 MB' });
		} else {
			valid.push(file);
		}
	});
	return { valid, rejected };
};

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');
```

```tsx
// admin/src/features/upload-documents/ui/file-dropzone.tsx
import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { useAdminStore } from '@/shared/store/admin-store';
import { ACCEPT_ATTRIBUTE, RejectedFile, validateFiles } from '../lib/validate-files';
import styles from './file-dropzone.module.css';

export const FileDropzone = () => {
	const uploadDocuments = useAdminStore((s) => s.uploadDocuments);
	const uploadError = useAdminStore((s) => s.uploadError);
	const inputRef = useRef<HTMLInputElement>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [rejected, setRejected] = useState<RejectedFile[]>([]);

	const handleFiles = async (files: File[]) => {
		const result = validateFiles(files);
		setRejected(result.rejected);
		if (result.valid.length > 0) {
			await uploadDocuments(result.valid);
		}
	};

	const handleDrop = async (event: DragEvent) => {
		event.preventDefault();
		setIsDragOver(false);
		await handleFiles([...event.dataTransfer.files]);
	};

	const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
		await handleFiles([...(event.target.files ?? [])]);
		event.target.value = '';               // allow re-picking the same file
	};

	const handleDragOver = (event: DragEvent) => {
		event.preventDefault();
		setIsDragOver(true);
	};

	const handleBrowseClick = () => inputRef.current?.click();

	return (
		<div className={styles.container}>
			<div
				className={isDragOver ? styles.zoneActive : styles.zone}
				onDragOver={handleDragOver}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={handleDrop}
				onClick={handleBrowseClick}
				role="button"
				tabIndex={0}
				aria-label="Upload documents"
				data-testid="file-dropzone"
			>
				Drop files here or click to browse (pdf, md, txt, html · max 10 MB)
			</div>
			<input
				ref={inputRef}
				type="file"
				multiple
				accept={ACCEPT_ATTRIBUTE}
				className={styles.hiddenInput}
				onChange={handleInputChange}
			/>
			{rejected.map((r) => (
				<p key={r.name} className={styles.rejected} role="alert">
					{r.name}: {r.reason}
				</p>
			))}
			{uploadError && <p className={styles.rejected} role="alert">{uploadError}</p>}
		</div>
	);
};
```

### Step 8: Features — delete-document + copy-embed-snippet

**File(s)**: `admin/src/features/delete-document/ui/delete-document-button.tsx` (+ `.module.css`),
`admin/src/features/delete-document/index.ts`,
`admin/src/features/copy-embed-snippet/lib/build-snippet.ts`,
`admin/src/features/copy-embed-snippet/ui/embed-snippet.tsx` (+ `.module.css`),
`admin/src/features/copy-embed-snippet/index.ts`

**Changes**:
- Delete button with a `window.confirm` guard → `store.deleteDocument`.
- Snippet built exactly per the embed contract in `docs/01-architecture-overview.md`
  (loader path `/embed/v1/loader.js`, required `data-hint-company-id`, explicit
  `data-hint-api-url` since the POC API is not on the default port for customers),
  rendered in the shared `CopyBlock`.

**Pseudo-code**:

```tsx
// admin/src/features/delete-document/ui/delete-document-button.tsx
import { useAdminStore } from '@/shared/store/admin-store';
import styles from './delete-document-button.module.css';

interface DeleteDocumentButtonProps {
	documentId: string;
	filename: string;
}

export const DeleteDocumentButton = ({ documentId, filename }: DeleteDocumentButtonProps) => {
	const deleteDocument = useAdminStore((s) => s.deleteDocument);

	const handleDelete = async () => {
		if (window.confirm(`Delete "${filename}" and its knowledge-base chunks?`)) {
			await deleteDocument(documentId);
		}
	};

	return (
		<button
			type="button"
			className={styles.button}
			onClick={handleDelete}
			aria-label={`Delete ${filename}`}
			data-testid={`delete-document-${documentId}`}
		>
			Delete
		</button>
	);
};
```

```typescript
// admin/src/features/copy-embed-snippet/lib/build-snippet.ts
import { API_URL, WIDGET_CDN_URL } from '@/shared/config';

export const buildEmbedSnippet = (companyId: string): string =>
	[
		`<script src="${WIDGET_CDN_URL}/embed/v1/loader.js"`,
		`        data-hint-company-id="${companyId}"`,
		`        data-hint-api-url="${API_URL}" defer></script>`,
	].join('\n');
```

```tsx
// admin/src/features/copy-embed-snippet/ui/embed-snippet.tsx
import { CopyBlock } from '@/shared/ui';
import { buildEmbedSnippet } from '../lib/build-snippet';
import styles from './embed-snippet.module.css';

interface EmbedSnippetProps {
	companyId: string;
}

export const EmbedSnippet = ({ companyId }: EmbedSnippetProps) => (
	<section className={styles.section} data-testid="embed-snippet">
		<h3>Embed snippet</h3>
		<p>Add this tag to the customer app to activate Hint:</p>
		<CopyBlock text={buildEmbedSnippet(companyId)} />
	</section>
);
```

### Step 9: Widgets — companies-sidebar, company-detail, api-status

**File(s)**: `admin/src/widgets/companies-sidebar/ui/companies-sidebar.tsx` (+ `.module.css`),
`admin/src/widgets/companies-sidebar/index.ts`,
`admin/src/widgets/company-detail/ui/company-detail.tsx` (+ `.module.css`),
`admin/src/widgets/company-detail/index.ts`,
`admin/src/widgets/api-status/ui/api-status-badge.tsx` (+ `.module.css`),
`admin/src/widgets/api-status/index.ts`

**Changes**:
- `CompaniesSidebar`: create form (feature) on top, list of `CompanyListItem`
  entities, loading spinner / error / empty states from the store.
- `CompanyDetail`: header (name + id), `EmbedSnippet`, `FileDropzone`, document list —
  placeholder rows for `uploadingFiles` (status `uploading`), then `DocumentRow`
  entities with the `DeleteDocumentButton` feature injected via the `actions` slot.
- `ApiStatusBadge`: Phase 0 badge moved from `app.tsx` verbatim, with `loadHealth`
  extracted out of the `useEffect` body (workspace rule) and styles moved to its own
  CSS module.

**Pseudo-code**:

```tsx
// admin/src/widgets/companies-sidebar/ui/companies-sidebar.tsx
import { useShallow } from 'zustand/react/shallow';
import { CompanyListItem } from '@/entities/company';
import { CreateCompanyForm } from '@/features/create-company';
import { useAdminStore } from '@/shared/store/admin-store';
import { Spinner } from '@/shared/ui';
import styles from './companies-sidebar.module.css';

export const CompaniesSidebar = () => {
	const { companies, isLoadingCompanies, companiesError, selectedCompanyId } =
		useAdminStore(useShallow((s) => ({
			companies: s.companies,
			isLoadingCompanies: s.isLoadingCompanies,
			companiesError: s.companiesError,
			selectedCompanyId: s.selectedCompanyId,
		})));
	const selectCompany = useAdminStore((s) => s.selectCompany);

	return (
		<aside className={styles.sidebar} data-testid="companies-sidebar">
			<CreateCompanyForm />
			{isLoadingCompanies && <Spinner />}
			{companiesError && <p className={styles.error} role="alert">{companiesError}</p>}
			{!isLoadingCompanies && companies.length === 0 && !companiesError && (
				<p className={styles.empty}>No companies yet — create the first one above.</p>
			)}
			<ul className={styles.list}>
				{companies.map((company) => (
					<li key={company.company_id}>
						<CompanyListItem
							company={company}
							isSelected={company.company_id === selectedCompanyId}
							onSelect={selectCompany}
						/>
					</li>
				))}
			</ul>
		</aside>
	);
};
```

```tsx
// admin/src/widgets/company-detail/ui/company-detail.tsx
import { useShallow } from 'zustand/react/shallow';
import { DocumentRow } from '@/entities/document';
import { DeleteDocumentButton } from '@/features/delete-document';
import { EmbedSnippet } from '@/features/copy-embed-snippet';
import { FileDropzone } from '@/features/upload-documents';
import { useAdminStore } from '@/shared/store/admin-store';
import { Spinner, StatusPill } from '@/shared/ui';
import { formatBytes } from '@/shared/lib/format-bytes';
import styles from './company-detail.module.css';

export const CompanyDetail = () => {
	const { company, documents, isLoadingDocuments, documentsError, uploadingFiles } =
		useAdminStore(useShallow((s) => ({
			company: s.companies.find((c) => c.company_id === s.selectedCompanyId) ?? null,
			documents: s.documents,
			isLoadingDocuments: s.isLoadingDocuments,
			documentsError: s.documentsError,
			uploadingFiles: s.uploadingFiles,
		})));

	if (!company) {
		return null;
	}

	return (
		<section className={styles.detail} data-testid="company-detail">
			<header className={styles.header}>
				<h2>{company.name}</h2>
				<code>{company.company_id}</code>
			</header>
			<EmbedSnippet companyId={company.company_id} />
			<h3>Documents</h3>
			<FileDropzone />
			{isLoadingDocuments && <Spinner />}
			{documentsError && <p className={styles.error} role="alert">{documentsError}</p>}
			<ul className={styles.documents}>
				{uploadingFiles.map((file) => (
					<li key={file.name} className={styles.uploadingRow}>
						<span>{file.name}</span>
						<span>{formatBytes(file.sizeBytes)}</span>
						<StatusPill status="uploading" />
					</li>
				))}
				{documents.map((doc) => (
					<DocumentRow
						key={doc.document_id}
						document={doc}
						actions={
							<DeleteDocumentButton
								documentId={doc.document_id}
								filename={doc.filename}
							/>
						}
					/>
				))}
			</ul>
			{!isLoadingDocuments && documents.length === 0 && uploadingFiles.length === 0 && (
				<p className={styles.empty}>No documents yet — drop the product docs above.</p>
			)}
		</section>
	);
};
```

```tsx
// admin/src/widgets/api-status/ui/api-status-badge.tsx
// Phase 0 badge moved verbatim from src/app.tsx, with two adjustments:
// - loadHealth defined in the component body (not inside useEffect) per workspace rule
// - styles moved from app.module.css into api-status-badge.module.css
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
			const data = (await res.json()) as { status?: string; mongo?: string; chroma?: string };
			const next = data.status === 'ok' ? 'ok' : 'degraded';
			setStatus(next);
			setDetail(`API ${next} · mongo=${data.mongo ?? '?'} · chroma=${data.chroma ?? '?'}`);
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
			<span className={`${styles.dot} ${styles[status]}`} aria-hidden="true" />
			<span>{detail}</span>
		</div>
	);
};
```

### Step 10: App composition root + cleanup of the Phase 0 shell

**File(s)**: `admin/src/app/app.tsx`, `admin/src/app/app.module.css`,
`admin/src/app/styles/global.css`, `admin/src/main.tsx` (update import),
delete: `admin/src/app.tsx`, `admin/src/app.module.css`, `admin/src/config.ts`

**Changes**:
- Two-pane layout (header with title + `ApiStatusBadge`; sidebar + detail pane in a
  CSS grid). `loadCompanies` fired once on mount; empty-selection placeholder in the
  right pane.
- `main.tsx` imports `@/app/app` and `@/app/styles/global.css`; the flat Phase 0
  files are removed (their content now lives in `shared/config`, `widgets/api-status`,
  and `app/`).

**Pseudo-code**:

```tsx
// admin/src/app/app.tsx
import { useEffect } from 'react';
import { ApiStatusBadge } from '@/widgets/api-status';
import { CompaniesSidebar } from '@/widgets/companies-sidebar';
import { CompanyDetail } from '@/widgets/company-detail';
import { useAdminStore } from '@/shared/store/admin-store';
import styles from './app.module.css';

export const App = () => {
	const loadCompanies = useAdminStore((s) => s.loadCompanies);
	const selectedCompanyId = useAdminStore((s) => s.selectedCompanyId);

	useEffect(() => {
		void loadCompanies();
	}, [loadCompanies]);

	return (
		<div className={styles.layout}>
			<header className={styles.header}>
				<h1>Hint Admin</h1>
				<ApiStatusBadge />
			</header>
			<div className={styles.panes}>
				<CompaniesSidebar />
				<main className={styles.main}>
					{selectedCompanyId ? (
						<CompanyDetail />
					) : (
						<p className={styles.placeholder}>
							Select a company on the left — or create one — to manage its
							knowledge base and get the embed snippet.
						</p>
					)}
				</main>
			</div>
		</div>
	);
};
```

```css
/* admin/src/app/app.module.css — layout essentials */
.layout {
	display: flex;
	flex-direction: column;
	min-height: 100vh;
}

.panes {
	display: grid;
	grid-template-columns: minmax(16rem, 22rem) 1fr;
	gap: var(--space-4);
	flex: 1;
	padding: var(--space-4);
}
```

```tsx
// admin/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/app';
import '@/app/styles/global.css';

const root = document.getElementById('root');
if (!root) {
	throw new Error('Root element #root not found');
}

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
```

### Step 11: Build + Docker + browser verification (exit criteria)

**File(s)**: none (verification only)

**Changes**:
- Local type-check + build must pass; rebuild the admin container; walk the full
  Phase 2 exit-criteria flow in the browser against the live backend.

**Pseudo-code**:

```bash
cd admin && pnpm install && pnpm build        # tsc -b && vite build — must be clean

cd .. && docker compose up --build -d admin backend mongo chromadb
open http://localhost:3001

# Browser walkthrough (exit criteria):
# 1. header shows "API ok · mongo=ok · chroma=ok"
# 2. create company "Acme Corp" → appears in the sidebar, auto-selected
# 3. drop 3 files (pdf + md + txt) → 3 "uploading" rows → 3 "ready" rows with chunk counts
# 4. drop a .png → instant local rejection "Unsupported file type: .png" (no request)
# 5. upload a scanned PDF → row shows "failed" + backend error reason
# 6. delete a document → confirm dialog → row disappears; re-check with:
curl -s "localhost:8000/api/v1/companies/{cmp_id}/documents"
# 7. click Copy on the embed snippet → clipboard holds the loader.js script tag
# 8. reload the page → companies persist, selecting one reloads its documents
```

### Step 12: Update Documentation (MANDATORY)

**File(s)**: `docs/04-admin.md` (new), `docs/01-architecture-overview.md`, `README.md`,
`plans/hint_poc_implementation.md`

**Changes**:
- Create `docs/04-admin.md`: FSD layer map for the admin app, store shape and action
  flow, API consumption table (which endpoint each feature calls), UX flows
  (create → upload → snippet), failure modes (backend down, 503 no key, failed
  ingestion rendering), build args (`VITE_API_URL`, `VITE_WIDGET_CDN_URL`).
- Update `docs/01-architecture-overview.md`: status banner → "Phase 2 complete",
  admin row in the component table ("shell page" → full admin panel), request-flow
  section (admin SPA now drives the admin flow), link to `04-admin.md`.
- Update `README.md`: admin walkthrough replaces the curl-only instructions as the
  primary flow (curl stays as the debug path).
- Update `plans/hint_poc_implementation.md`: mark Phase 2 steps 2.1–2.2 with ✅,
  check off the `admin/` entry in "Files to Modify".

**Pseudo-code**:

```markdown
# docs/04-admin.md (skeleton)
# Hint — Admin Panel

> Status: Phase 2 complete. React 18 + Vite + TS, strict FSD, Zustand, Zod.

## FSD layout
app/ → widgets/ (companies-sidebar, company-detail, api-status)
     → features/ (create-company, upload-documents, delete-document, copy-embed-snippet)
     → entities/ (company, document) → shared/ (api, config, store, ui, lib)

## State (shared/store/admin-store.ts)
companies · selectedCompanyId · documents · uploadingFiles · error strings
Actions: loadCompanies / createCompany / selectCompany / loadDocuments /
uploadDocuments / deleteDocument — all call shared/api, surface ApiError.detail.

## API consumption
| Feature / widget    | Endpoint                                            |
|---------------------|-----------------------------------------------------|
| companies-sidebar   | GET /api/v1/companies                               |
| create-company      | POST /api/v1/companies                              |
| company-detail      | GET /api/v1/companies/{id}/documents                |
| upload-documents    | POST /api/v1/companies/{id}/documents (multipart)   |
| delete-document     | DELETE /api/v1/companies/{id}/documents/{doc_id}    |
| api-status          | GET /health                                         |

## Failure modes
(backend down → banner; 503 missing key → verbatim detail; failed ingestion →
red status pill + reason; oversized/unsupported files → local pre-validation)
```

---

## Edge Cases

- **Backend down on load** → companies list shows "API unreachable — is the backend
  running?" (from `ApiError(0, …)`); health badge goes red independently.
- **503 missing `OPENAI_API_KEY` on upload** → the backend's actionable `detail`
  ("set it in .env and restart") is rendered verbatim under the dropzone.
- **Mixed upload batch** (good pdf + scanned pdf) → server returns per-file status;
  the refreshed list shows one `ready` and one `failed` row with the error reason —
  the batch never atomically fails.
- **Unsupported extension / > 10 MB file** → rejected client-side with an instant
  message; no request is sent (server would answer with per-file `failed` / 413).
- **Duplicate file re-pick** → the file input's value is reset after each change so
  selecting the same file twice re-triggers `onChange`.
- **Company with zero documents** → explicit empty state, dropzone still active;
  matches the backend behavior (`GET .../documents` → `[]`).
- **Deleting a document that was already deleted elsewhere** → 404 `detail` surfaces
  in `documentsError`; list refresh on next selection reconciles.
- **Clipboard API unavailable** (non-secure context) → `handleCopy` rejection is
  visible in dev tools; snippet text remains selectable in the `<pre>` for manual copy.
- **Rapid company switching during a slow document load** → `selectCompany` resets
  `documents` before loading; last-write-wins is acceptable for the POC (single user).

## Testing Checklist

- [ ] `pnpm build` (tsc + vite) passes with zero errors
- [ ] `docker compose up --build admin` serves the new UI on :3001
- [ ] Create company → appears in sidebar, auto-selected, snippet shows its `cmp_` id
- [ ] Company name validation: empty and 101-char names blocked with Zod messages
- [ ] Upload 3 files (pdf/md/txt) via drag-and-drop → uploading rows → all `ready`
- [ ] Upload via click-to-browse works identically
- [ ] `.png` and >10 MB files rejected locally with reasons; no network request
- [ ] Scanned PDF shows `failed` pill + backend error reason
- [ ] Delete document: confirm dialog, row disappears, backend list confirms (curl)
- [ ] Copy button puts the exact documented script tag on the clipboard
- [ ] Backend stopped → friendly errors in sidebar + red health badge, no console spam
- [ ] FSD import audit: no feature→feature, feature→widget, or entity→feature imports;
      all cross-feature state goes through `shared/store/admin-store.ts`

## Files to Modify

- [ ] `admin/package.json`, `admin/pnpm-lock.yaml` (add `zod`, `zustand`)
- [ ] `admin/tsconfig.json`, `admin/vite.config.ts` (`@/` alias)
- [ ] `admin/src/shared/config/index.ts`
- [ ] `admin/src/shared/api/{http,types,companies,documents,index}.ts`
- [ ] `admin/src/shared/store/admin-store.ts`
- [ ] `admin/src/shared/lib/{error-message,format-bytes}.ts`
- [ ] `admin/src/shared/ui/styles/variables.css`
- [ ] `admin/src/shared/ui/{button,text-input,status-pill,copy-block,spinner}/*` + `admin/src/shared/ui/index.ts`
- [ ] `admin/src/entities/company/{ui/company-list-item.tsx,index.ts}` + styles
- [ ] `admin/src/entities/document/{ui/document-row.tsx,index.ts}` + styles
- [ ] `admin/src/features/create-company/{model/schema.ts,ui/create-company-form.tsx,index.ts}` + styles
- [ ] `admin/src/features/upload-documents/{lib/validate-files.ts,ui/file-dropzone.tsx,index.ts}` + styles
- [ ] `admin/src/features/delete-document/{ui/delete-document-button.tsx,index.ts}` + styles
- [ ] `admin/src/features/copy-embed-snippet/{lib/build-snippet.ts,ui/embed-snippet.tsx,index.ts}` + styles
- [ ] `admin/src/widgets/companies-sidebar/{ui/companies-sidebar.tsx,index.ts}` + styles
- [ ] `admin/src/widgets/company-detail/{ui/company-detail.tsx,index.ts}` + styles
- [ ] `admin/src/widgets/api-status/{ui/api-status-badge.tsx,index.ts}` + styles
- [ ] `admin/src/app/{app.tsx,app.module.css,styles/global.css}`
- [ ] `admin/src/main.tsx` (updated imports)
- [ ] Delete: `admin/src/app.tsx`, `admin/src/app.module.css`, `admin/src/config.ts`
- [ ] `docs/04-admin.md` (new)
- [ ] `docs/01-architecture-overview.md`, `README.md` (Phase 2 status + walkthrough)
- [ ] `plans/hint_poc_implementation.md` (mark Phase 2 ✅)

## Implementation Order

1. **Step 1** — deps + alias + scaffold (everything imports through `@/`)
2. **Step 2** — shared config + API layer (typed contracts first)
3. **Step 3** — Zustand store (consumes Step 2)
4. **Step 4** — shared UI primitives + tokens + helpers
5. **Step 5** — entities (consume shared types + UI)
6. **Steps 6–8** — features (consume store + entities' contracts); 6, 7, 8 are
   independent of each other and can be done in any order
7. **Step 9** — widgets (compose features + entities)
8. **Step 10** — app composition + Phase 0 shell cleanup
9. **Step 11** — build + Docker + browser verification of exit criteria
10. **Step 12** — documentation (mandatory final step)
