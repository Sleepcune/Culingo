# Verification report

Run from the repository root after `npm install`.

## Automated evidence

- `npm run typecheck` — passed for the browser extension, Zotero plugin, and all four shared packages.
- `npm test` — browser: 43 tests passed; Zotero: 45 tests passed; shared core: 3 tests passed; shared translation: 1 test passed.
- `npm run build:browser` — passed; WXT produced the Chrome MV3 output (about 15.17 MB including the packaged dictionary).
- `npm run build:zotero` — passed; produced `apps/zotero-plugin/dist/culingo-zotero-0.1.0.xpi` with 30 files.
- AI word persistence tests cover IndexedDB storage, lookup rehydration, backup-compatible data shape, and immediate card rendering without a second translation click.

## Manual or host evidence still required

- Install the generated extension in Chrome and Edge and exercise a real page.
- Install the XPI in a real Zotero 10 profile and exercise a real, text-based PDF.
- Run the Playwright browser E2E suite with the required browser binary installed.
- Run `npm run test:host --workspace @culingo/zotero-plugin` with an available Zotero executable and isolated profile.
- Verify a real API call, cancellation, rate-limit behavior, and user-visible AI meaning persistence.
- Verify backup import/export through the actual UI and restore into a clean profile.

## Unsupported assumptions

- The repository does not prove that browser and Zotero local stores are synchronized; they remain independent in this architecture.
- A successful XPI build does not prove host compatibility across all Zotero 10 patch versions.
- A successful browser build does not prove Chrome Web Store or Edge Add-ons review acceptance.
- Dependency audit currently reports vulnerabilities from the installed dependency graph; remediation was not performed in this scope.