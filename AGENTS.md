# AGENTS.md

## Project Overview

- TypeScript MCP (Model Context Protocol) server that persists “memories” in a local SQLite database using Node’s built-in `node:sqlite`.
- Runs as a CLI/stdio MCP server (entrypoint: `src/index.ts`; compiled output: `dist/index.js`).
- Package: `@j0hanz/memdb` (CLI name: `memdb`).

## Repo Map / Structure

- `src/`: MCP server implementation (stdio transport + tools)
  - `src/index.ts`: server entrypoint (stdio)
  - `src/tools.ts`: tool registration and handlers
  - `src/schemas.ts`: Zod input/output schemas
  - `src/types.ts`: shared TypeScript types
  - `src/core/`: SQLite schema + CRUD/search logic
  - `src/instructions.md`: instructions text embedded into the MCP server at runtime (copied to `dist/instructions.md` on build)
- `tests/`: Node test-runner tests (`tests/*.test.ts`) + `tests/fixtures/`
- `scripts/`: maintenance/quality automation
  - `scripts/Quality-Gates.ps1`: metric capture/compare + “safe refactor” workflow
- `metrics/`: captured quality-gate artifacts (snapshots)
- `dist/`: build output (generated)

## Setup & Environment

- Runtime: Node.js `>=22.0.0` (required for `node:sqlite`; declared in `package.json` `engines.node`).
- Package manager: npm (repo includes `package-lock.json`; CI uses `npm ci`).

Install dependencies:

- `npm ci`
  - Uses the lockfile; this is what CI runs.
- `npm install`
  - Documented in README under “From Source”.

Environment configuration:

- `MEMDB_PATH`: override SQLite DB path. Default is `<cwd>/.memdb/memory.db`.
- `MEMDB_LOG_LEVEL`: `error|warn|info` (default `info`).

## Development Workflow

- Run in watch mode (TypeScript, no build): `npm run dev`
- Build to `dist/`: `npm run build`
  - Also copies `src/instructions.md` → `dist/instructions.md` and sets executable bit on `dist/index.js`.
- Run built server: `npm run start`
- MCP Inspector (interactive client): `npm run inspector`

Suggested local “preflight” before a PR:

- Format check: `npm run format:check`
- Lint: `npm run lint`
- Type-check: `npm run type-check`
- Tests: `npm run test`

## Testing

- Run all tests: `npm run test`
  - Uses Node’s built-in test runner with ESM TS loader: `node --import tsx/esm --test tests/*.test.ts`.
- Coverage: `npm run test:coverage`
  - Uses Node’s experimental coverage: `node --import tsx/esm --test --experimental-test-coverage tests/*.test.ts`.

Test locations/patterns:

- `tests/*.test.ts`
- Fixtures: `tests/fixtures/`

## Code Style & Conventions

- Language: TypeScript (ESM; `package.json` has `"type": "module"`).
- TS config: `module`/`moduleResolution` are `NodeNext`, strict mode enabled, and `noUncheckedIndexedAccess` enabled (`tsconfig.json`).
- Local imports in TS source use `.js` extensions (see `src/index.ts`), consistent with NodeNext ESM.

Linting:

- Run ESLint: `npm run lint`
- ESLint config: `eslint.config.mjs` (flat config; ignores `dist/`, `node_modules/`, and `*.config.*`).

Formatting:

- Apply formatting: `npm run format`
- Check formatting: `npm run format:check`
- Prettier config: `.prettierrc` (includes `@trivago/prettier-plugin-sort-imports` + `importOrder`).

## Build / Release

- Build command: `npm run build` → outputs `dist/`
- Published entrypoints:
  - `main`: `dist/index.js`
  - `types`: `dist/index.d.ts`
  - CLI: `memdb` → `dist/index.js` (see `package.json` `bin`).

Release automation (GitHub Actions):

- Workflow: `.github/workflows/publish.yml`
  - Trigger: GitHub Release “published”.
  - Runs: `npm ci`, then `npm run lint`, `npm run type-check`, `npm run test`, `npm run test:coverage`, `npm run duplication`, `npm run build`.
  - Updates package version from tag (`vX.Y.Z`) and publishes to npm via Trusted Publishing (OIDC).

## Security & Safety

- Data is stored locally in a SQLite file under `.memdb/` by default. Avoid committing local DB files.
- Do not store secrets/credentials in `src/instructions.md` or tests/fixtures.
- Be careful with destructive DB operations when changing tool behavior (delete/update semantics are user-facing).

## Pull Request / Commit Guidelines

- No repo-specific commit format is defined; keep commits small and focused.
- Before opening a PR, run the same checks as the publish workflow:
  - `npm run lint`
  - `npm run type-check`
  - `npm run test`
  - `npm run test:coverage`
  - `npm run duplication`

Optional local quality-gates (PowerShell):

- Script: `scripts/Quality-Gates.ps1` (PowerShell `>=5.1`)
- Examples from the script:
  - Measure: `./Quality-Gates.ps1 -Mode Measure`
  - Compare: `./Quality-Gates.ps1 -Mode Compare -SkipCurrentCapture -PassThru`
  - Safe refactor (supports `-WhatIf`): `./Quality-Gates.ps1 -Mode SafeRefactor -Command "npm run format" -WhatIf`

## Troubleshooting

- `node:sqlite` / `DatabaseSync` not found: install Node.js `>=22.0.0`.
- FTS/search issues: this server uses SQLite FTS5; if your SQLite build lacks FTS5, searches may fail.
- Stale tool lists in clients: some MCP clients cache tool definitions; reset via the client’s MCP tool-cache reset (noted in `src/instructions.md`).
