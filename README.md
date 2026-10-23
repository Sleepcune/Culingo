# CuLingo

CuLingo contains two independently packaged clients that share small platform-neutral TypeScript packages:

- `apps/browser-extension/` — Chrome/Edge Manifest V3 extension built with WXT.
- `apps/zotero-plugin/` — Zotero 10 plugin built as an XPI.
- `packages/core/` — word normalization, lemma resolution, highlighting rules, and CSV parsing.
- `packages/contracts/` — shared domain contracts.
- `packages/dictionary/` — dictionary asset manifest contracts.
- `packages/translation/` — bounded text splitting for translation requests.

The clients keep their own storage, UI, host lifecycle, and platform adapters. No local service, account system, cloud sync, or cross-client database was introduced.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build:browser
npm run build:zotero
```

Browser-only commands:

```bash
npm run prepare --workspace @culingo/browser-extension
npm run test:browser
npm run build:browser
```

Zotero-only commands:

```bash
npm run test:zotero
npm run build:zotero
npm run test:host --workspace @culingo/zotero-plugin
```

## Data and privacy

The browser extension stores learning data in its own IndexedDB. Zotero stores learning data in its own host-backed store. Existing backup version 1 remains readable; the browser backup now optionally includes persisted AI meaning overrides without including API credentials. Dictionary assets remain read-only packaged resources and retain their source license.

AI word translations are saved locally as a per-word meaning override. Reopening the same word displays the saved AI meaning immediately; the translation service is not called again unless the user explicitly requests a new translation.

## Historical planning documents

`docs/plans/2026-10-03-zotero-shared-learning-plan.md` is retained as a historical proposal. It describes a possible local service and unified database that are **not implemented by this repository state**. The implemented boundaries are documented in `docs/ARCHITECTURE.md`.

