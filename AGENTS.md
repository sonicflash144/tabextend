# Repository Guidelines

## Project Structure & Module Organization

Tabs Magic is a Manifest V3 extension. Page entry points are `newtab.html`, `newtab.js`, and `newtab.css`; `background.js` is the service worker. Webpack writes deployable JavaScript to `dist/`.

Testable code belongs in `src/`: migrations in `compatibility/`, state and pure operations in `domain/`, browser boundaries in `infrastructure/`, safe-content helpers in `security/`, and DOM rendering/controllers in `ui/`. Tests mirror these folders under `test/`; historical exports live in `test/fixtures/exports/`.

## Build, Test, and Development Commands

- `npm install`: install locked dependencies.
- `npm test`: run the `node:test` suite.
- `npm run build`: create production bundles and source maps in `dist/`.

For manual testing, build, enable browser developer mode, and load this repository as an unpacked extension. Reload it after rebuilding.

## Coding Style & Naming Conventions

Use JavaScript modules under `src/` and four-space indentation in application code. Follow surrounding legacy/configuration style. Use `camelCase` for values and functions, `PascalCase` for constructors, and descriptive kebab-case fixtures. Prefer pure functions and injected browser adapters. No formatter or linter is configured; run `git diff --check`.

## Testing Guidelines

Name tests `*.test.mjs`, mirror their `src/` layer, and use `node:assert/strict` with behavior-focused names. Add fixtures for historical formats and regression tests for fixes. No numeric coverage threshold exists, but new extracted logic needs tests. Run tests and the production build before submitting.

## Active Architecture Refactor

The ongoing refactor is moving the monolithic `newtab.js` toward tested domain, infrastructure, and UI modules. Completed foundations include historical-format validation/migration, transactional imports with rollback, safe stored-content handling, Chrome/storage adapters, and canonical in-memory state. Pure immutable tab, column, group, and drop operations now live in `src/domain/operations.mjs` and `src/domain/drop-operations.mjs`; page mutations and drag/drop route through these operations instead of reconstructing state from the DOM. Persistence intentionally still writes the legacy `savedTabs` and `columnState` shapes.

Rendering has been extracted to `src/ui/rendering.mjs`. Menu, selection, and editable-title behavior lives in focused controllers under `src/ui/controllers/`, with controller behavior covered by tests. `newtab.js` remains the composition root and still owns several application workflows and complex drag event wiring.

Next, route remaining direct `chrome.*` calls through adapters/repositories and continue extracting application behavior and drag/event coordination from `newtab.js`. Split the rendering module into smaller view modules if it becomes difficult to maintain, and add focused DOM tests when a suitable test DOM is available. Add tests before moving each behavior, and preserve the grouped-tab drag/drop regression fix when changing UI identity or event targeting. Do not remove legacy readers/writers, change export shapes, discard unknown supported metadata, or weaken import rollback. Existing users' stored and exported data must remain readable. Never render stored notes or URLs through unsafe HTML APIs.

## Commits & Pull Requests

History uses brief, task-specific subjects such as `savedTabs delete fix`; keep commits concise and scoped. Pull requests should explain user-visible behavior, compatibility impact, tests performed, and any manifest or storage changes. Link related issues and include screenshots or a short recording for UI changes.
