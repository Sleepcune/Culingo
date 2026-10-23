# Implemented architecture

## Repository layout

```text
CuLingo/
├─ apps/
│  ├─ browser-extension/       # WXT + MV3, browser.runtime, Dexie, React UI
│  └─ zotero-plugin/           # Zotero lifecycle, Reader adapter, host storage, XPI
├─ packages/
│  ├─ core/                    # platform-neutral word and CSV rules
│  ├─ contracts/               # shared domain types
│  ├─ dictionary/              # dictionary asset contracts
│  └─ translation/             # bounded translation text splitting
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ VERIFICATION.md
│  └─ plans/                   # historical proposals
└─ package.json                # npm workspaces and aggregate commands
```

## Dependency direction

```text
browser-extension ─┬─> core ───────> contracts
                   ├─> translation
                   └─> browser-only adapters/storage/UI

zotero-plugin ──────┬─> core ───────> contracts
                   ├─> translation
                   └─> Zotero host/Reader/storage/UI adapters

dictionary assets ──> each client package as a read-only, licensed build input
```

The shared packages do not import browser APIs, Zotero globals, React, Dexie, or filesystem APIs. Each client owns its runtime transport and persistence.

## Migration boundaries

- Browser IndexedDB schema migration: Dexie version 2 adds `meaningOverrides`; prior stores remain intact.
- Browser backup import: version 1 backups without `meaningOverrides` are accepted; newly exported version 1 backups may carry the optional field.
- Zotero backup and storage formats are unchanged in this step.
- Dictionary assets are not rewritten by application runtime code.
- Git history is preserved; the directory reorganization is represented as Git renames where Git can detect them.

## AI meaning persistence

The browser flow is:

1. `dictionary.lookup` returns the local entry plus an optional `aiTranslation` override.
2. `translation.translate` performs the explicit AI request.
3. `dictionary.saveMeaningOverride` stores the normalized word and returned meaning in IndexedDB.
4. Subsequent lookup renders the local dictionary meaning and `AI 中文释义：...` without another AI request.
5. The override is included in browser backup export/import and never contains the API key.

This is intentionally browser-local. It does not claim cross-application synchronization.

## Explicit non-goals

This reorganization does not add a service, cloud sync, account system, OCR, new reader mode, automatic publishing, or a new product surface. Real PDF and browser automation remains a separate host-validation step.
