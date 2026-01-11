# AGENTS.md

## Project Overview

- **What this repo is:** `memdb` is a local, SQLite-backed **Model Context Protocol (MCP)** server that provides memory CRUD + search tools over **stdio**.
- **Language / runtime:** TypeScript (ESM) targeting Node.js (see `package.json` `engines.node`).
- **Key libraries:** `@modelcontextprotocol/sdk` (server), `zod` (schemas), Node built-in `node:sqlite` (storage).
- **Entry point:** `src/index.ts` (compiled to `dist/index.js`, also used as the CLI `memdb`).

## Repo Map / Structure

- `src/`: MCP server implementation
  - `src/index.ts`: stdio server bootstrap + shutdown handling
  - `src/config.ts`: CLI/env config (DB path, log level)
  - `src/schemas.ts`: Zod input/output schemas for tools
  - `src/tools.ts`: MCP tool registration (wrapping core services)
  - `src/core/`: SQLite access + domain logic
    - `src/core/db.ts`: schema, DB init, statement helpers, FTS setup
    - `src/core/memory-read.ts`: read operations
    - `src/core/memory-write.ts`: write/update operations
    - `src/core/search.ts`: search operations
- `tests/`: Node.js test runner tests (`tests/*.test.ts`)
- `dist/`: build output (generated)
- `.memdb/`: runtime database directory (created at runtime; gitignored)
- `.github/workflows/publish.yml`: npm publish workflow (runs on GitHub Release publish)
- `scripts/Quality-Gates.ps1`: PowerShell helper for metrics/quality gating (see file header)

## Setup & Environment

- Required Node.js: see `package.json` `engines.node` (repo currently declares `>=22.0.0`).
- Package manager: `npm` (repo includes `package-lock.json`).

Commands:

- Install deps (local): `npm install`
- Install deps (CI): `npm ci`

Runtime configuration:

- Default DB path: `<cwd>/.memdb/memory.db` (created automatically)
- Env vars:
  - `MEMDB_PATH`: override DB path (`:memory:` for in-memory)
  - `MEMDB_LOG_LEVEL`: `info` | `warn` | `error`
- CLI flags:
  - `--db <path>`: override DB path
  - `--memory`: use in-memory DB (`:memory:`)
  - `--log-level <level>`

Precedence: CLI flags > environment variables > defaults.

## Development Workflow

- Dev (watch): `npm run dev` (uses `tsx watch src/index.ts`)
- Build: `npm run build` (TypeScript build to `dist/`)
- Run built server (stdio): `npm start` (runs `node dist/index.js`)
- Inspector UI (for MCP): `npm run inspector` (see README / `@modelcontextprotocol/inspector`)

Tip: when debugging an installed build, build first: `npm run build`.

## Testing

- Run all tests: `npm test`
- Run coverage: `npm run test:coverage`
- Type-check tests (includes `tests/`): `npm run type-check:test`

Notes:

- Tests use Node’s built-in test runner with `tsx` ESM loader: `node --import tsx/esm --test tests/*.test.ts`.

## Code Style & Conventions

- TypeScript:
  - `module`/`moduleResolution`: `NodeNext` (ESM)
  - Prefer type-only imports (`import { type X } from ...`) when applicable.
  - Local imports use `.js` extensions (because NodeNext ESM output).
- Lint: `npm run lint` (ESLint flat config in `eslint.config.mjs`; `src/**/*.ts` uses type-aware rules)
- Format:
  - `npm run format` (Prettier)
  - `npm run format:check`
  - Import ordering is enforced via `@trivago/prettier-plugin-sort-imports` (see `.prettierrc`).

## Build / Release

- Build output: `dist/`
- Package entrypoints:
  - `main`: `dist/index.js`
  - `types`: `dist/index.d.ts`
  - CLI: `memdb` → `dist/index.js`
- Release/publish:
  - `npm run prepublishOnly` runs `lint`, `type-check`, and `build`.
  - GitHub Actions workflow `.github/workflows/publish.yml` publishes to npm on GitHub Release publish (Trusted Publishing / OIDC).

## Security & Safety

- This is a **local** database by default. The `.memdb/` directory is gitignored; don’t commit DB files.
- The MCP server runs over **stdio**. Avoid adding any non-protocol output to **stdout**; use logging mechanisms that write to stderr.
- Tool safety:
  - Tools validate inputs with Zod schemas.
  - `delete_memory` is destructive.
  - DB path is resolved to an absolute path unless `:memory:` is used; null bytes are rejected.

## Pull Request / Commit Guidelines

- No repo-wide PR/commit convention is defined in tracked docs.
- Before opening a PR, run at least:
  - `npm run lint`
  - `npm run type-check`
  - `npm test`
- Keep changes small and focused; update README/tool schemas when changing tool behavior.

## Troubleshooting

- **Node version errors:** This repo declares Node `>=22.0.0` in `package.json`. If commands fail under older Node, upgrade Node.
- **Server won’t start / inspector issues:** build first (`npm run build`), then run (`npm start`).
- **DB location surprises:** DB path is relative to the process working directory (`process.cwd()`) unless overridden by `--db` or `MEMDB_PATH`.

## Open Questions / TODO

- `.github/workflows/publish.yml` runs `npm run maintainability`, but `package.json` currently does **not** define a `maintainability` script.
- `.github/workflows/publish.yml` pins Node `20`, while `package.json` declares `engines.node >=22.0.0`.
- `.github/instructions/typescript-mcp-server.instructions.md` mentions Zod v3, but `package.json` depends on Zod v4.
