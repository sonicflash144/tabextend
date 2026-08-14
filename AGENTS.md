# Repository Guidelines

## Project Structure & Module Organization

Tabs Magic is a Manifest V3 extension. Page entry points are `newtab.html`, `newtab.js`, and `newtab.css`; `background.js` is the service worker. Webpack writes deployable JavaScript to `dist/`.

Testable code belongs in `src/`: application workflows in `application/`, migrations in `compatibility/`, state and pure operations in `domain/`, browser boundaries in `infrastructure/`, safe-content helpers in `security/`, and DOM rendering/controllers in `ui/`. Tests mirror these folders under `test/`; historical exports live in `test/fixtures/exports/`.

## Build, Test, and Development Commands

- `npm install`: install locked dependencies.
- `npm test`: run the `node:test` suite.
- `npm run lint`: run ESLint across source, tests, and configuration files.
- `npm run lint:fix`: apply ESLint's safe automatic fixes.
- `npm run build`: create production bundles and source maps in `dist/`.
- `npm run format` / `npm run format:check`: write or check Prettier formatting. Do not mix a repository-wide formatting pass into a behavioral refactor.

For manual testing, build, enable browser developer mode, and load this repository as an unpacked extension. Reload it after rebuilding.

## Coding Style & Naming Conventions

Use JavaScript modules under `src/` and four-space indentation in application code. Follow surrounding legacy/configuration style. Use `camelCase` for values and functions, `PascalCase` for constructors, and descriptive kebab-case fixtures. Prefer pure functions and injected browser adapters. ESLint uses the flat configuration in `eslint.config.mjs`, with separate browser/WebExtension, Node test, and CommonJS Webpack environments. Prettier is available, but postpone the initial repository-wide formatting pass until it can be reviewed as a standalone change. Always run `git diff --check`.

## Testing Guidelines

Name tests `*.test.mjs`, mirror their `src/` layer, and use `node:assert/strict` with behavior-focused names. Add fixtures for historical formats and regression tests for fixes. No numeric coverage threshold exists, but new extracted logic needs tests. Before submitting, run `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.

## Active Architecture Refactor

The ongoing refactor is moving the monolithic `newtab.js` toward tested application, domain, infrastructure, and UI modules while retaining the deployed storage and export formats.

### Completed

- Historical exports are unwrapped, validated, and migrated in `src/compatibility/legacy-data.mjs`. This includes old unversioned envelopes, numeric tab IDs, subgroup references, orphan recovery, temporary markers, and preservation of supported unknown metadata.
- `src/domain/state.mjs` provides canonical in-memory state and legacy conversion. Validation now reports malformed structures, missing or duplicate ordering, duplicate column/group identities, and tabs placed more than once.
- Pure immutable tab, column, group, and drop operations live in `src/domain/operations.mjs` and `src/domain/drop-operations.mjs`. Page mutations and drag/drop use these operations instead of rebuilding state from the DOM.
- `src/application/state-storage.mjs` now owns startup reads, migration and orphan recovery, one-time background-tab consumption, default-column creation, canonical persistence, legacy write-back, reloads, and external storage synchronization. Persistence intentionally continues writing `savedTabs` and `columnState`.
- Imports use a transactional backup/write/verify flow with rollback. Verification compares JSON structurally instead of depending on object-property order and identifies mismatched storage keys when verification genuinely fails.
- Current exports are versioned and omit the transient `tabsMagicImportBackup` and `animation` keys. Readers remain compatible with old exports that contain those keys.
- Chrome API and storage boundaries have initial adapters under `src/infrastructure/`; stored notes and URLs pass through safe-content helpers under `src/security/`.
- Rendering is extracted to `src/ui/rendering.mjs`. Menu, selection, and editable-title behavior lives in focused controllers under `src/ui/controllers/`, with controller tests.
- ESLint flat configuration and npm lint/format scripts are installed. The first lint pass also fixed the column drag indicator boundary check, which previously ran before its position was calculated.
- The automated suite currently has 63 passing tests covering compatibility, canonical state and operations, storage lifecycle/synchronization, transactional imports, adapters, safe content, and UI controllers. Production bundles have been rebuilt from the current source.

`newtab.js` remains the composition root. It still owns open-tab workflows, settings/release/export/import coordination, storage event UI effects, and complex drag event wiring. `background.js` still contains direct browser API and background-storage workflows.

### Remaining Work, in Priority Order

1. Merge this state/storage slice into `main`, then unify Chrome, Firefox, and Safari from one source line. Keep browser-neutral application code and small per-browser manifest/build/packaging overrides instead of long-lived divergent product branches. Confirm export/import round trips across all three browsers.
2. Complete browser-boundary extraction. Route remaining direct `chrome.*` calls in `newtab.js` and `background.js` through focused adapters/repositories, with particular attention to open-tab/group behavior, settings, import/export, release state, context menus, and queued background tabs.
3. Extract remaining application workflows from `newtab.js`, then move drag/event coordination into a focused controller. Preserve the grouped-tab drag/drop fix and column-indicator clamping behavior, and add tests before moving each behavior.
4. Add a suitable DOM test environment and focused integration tests for rendering, editing, selection, menus, drag targeting, and storage-driven UI updates. Split `src/ui/rendering.mjs` into smaller view modules only when that improves maintainability.
5. Establish Prettier settings that preserve the repository's four-space style, apply the initial full formatting in a standalone commit, and add lint/test/build/format checks to CI.

Do not remove legacy readers or writers, silently change export shapes, discard unknown supported metadata, or weaken import rollback. Existing users' stored and exported data must remain readable. Never render stored notes or URLs through unsafe HTML APIs; existing `innerHTML` usage is limited to static application-owned SVG markup.

## Commits & Pull Requests

History uses brief, task-specific subjects such as `savedTabs delete fix`; keep commits concise and scoped. Pull requests should explain user-visible behavior, compatibility impact, tests performed, and any manifest or storage changes. Link related issues and include screenshots or a short recording for UI changes.
