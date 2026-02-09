# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** SQLite-backed MCP (Model Context Protocol) memory server providing knowledge graph capabilities and full-text search for AI assistants.
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9.3 (see [package.json](package.json)), targeting Node.js >=24.0.0
  - **Runtime:** Node.js >=24 with native `node:sqlite` module (see [package.json](package.json) `engines` field)
  - **Protocol:** Model Context Protocol SDK `@modelcontextprotocol/sdk` v1.26.0 (see [package.json](package.json))
  - **Database:** SQLite with FTS5 (full-text search) via `node:sqlite` sync API (see [src/core/db.ts](src/core/db.ts))
  - **Validation:** Zod v4.3.6 schema validation (see [package.json](package.json), [src/schemas.ts](src/schemas.ts))
- **Architecture:** Layered MCP server (see [README.md](README.md)):
  - **Transport Layer:** stdio with batch rejection (see [src/stdio-transport.ts](src/stdio-transport.ts))
  - **Protocol Layer:** Version guard and server setup (see [src/index.ts](src/index.ts), [src/protocol-version-guard.ts](src/protocol-version-guard.ts))
  - **Tool Layer:** MCP tool registration and error handling (see [src/tools.ts](src/tools.ts), [src/schemas.ts](src/schemas.ts))
  - **Core Layer:** Database operations, search, relationships (see [src/core/](src/core/))

## 2) Repository Map (High-Level)

- `src/`: Main source code (TypeScript, compiled to `dist/`)
  - `src/core/`: Database and business logic
    - `db.ts`: SQLite connection, schema, WAL mode, statement caching
    - `memory-read.ts`: Get, delete, stats operations
    - `memory-write.ts`: Store, update operations with SHA-256 deduplication
    - `relationships.ts`: Graph edge operations (create/get/delete relationships)
    - `search.ts`: FTS5 full-text search and graph traversal (`recall` tool)
  - `index.ts`: Server entrypoint, stdio transport setup, resource registration
  - `tools.ts`: MCP tool registration with timeout handling and error wrapping
  - `schemas.ts`: Zod schemas for all 12 MCP tools (input validation)
  - `types.ts`: TypeScript interfaces (Memory, Relationship, SearchResult, etc.)
  - `config.ts`: Environment variable configuration
  - `logger.ts`: Logging utilities
  - `stdio-transport.ts`: Custom stdio transport with batch request rejection
  - `protocol-version-guard.ts`: Protocol version validation wrapper
  - `instructions.md`: User-facing instructions (exposed as MCP resource)
- `tests/`: Native Node.js tests using `node:test` runner
- `scripts/`: Build and task automation (see [scripts/tasks.mjs](scripts/tasks.mjs))
- `dist/`: Compiled JavaScript output (generated, not in source control)

> Ignore generated/vendor: `dist/`, `node_modules/`, `.tsbuildinfo` files.

## 3) Operational Commands (Verified)

All commands verified from [package.json](package.json) `scripts` section.

- **Environment:** Node.js >=24.0.0 required (see [package.json](package.json) `engines`). Optional `.env` file for config (see [README.md](README.md)).
- **Install:** `npm install` (verified from [package.json](package.json))
- **Dev (Watch Mode):** `npm run dev` — TypeScript watch mode with `tsc --watch` (verified from [package.json](package.json))
- **Dev (Run):** `npm run dev:run` — Run with `node --watch` and `--env-file=.env` (verified from [package.json](package.json))
- **Build:** `npm run build` — Compiles TypeScript using [scripts/tasks.mjs](scripts/tasks.mjs) which runs `tsc -p tsconfig.build.json` (verified)
- **Start:** `npm start` — Run compiled server at `dist/index.js` (verified from [package.json](package.json))
- **Test:** `npm test` — Runs native Node.js test runner via [scripts/tasks.mjs](scripts/tasks.mjs) on `tests/**/*.test.ts` (verified)
- **Test (Coverage):** `npm run test:coverage` — Runs tests with coverage (verified from [package.json](package.json))
- **Type Check:** `npm run type-check` — Runs `tsc --noEmit` via [scripts/tasks.mjs](scripts/tasks.mjs) (verified)
- **Lint:** `npm run lint` — ESLint via [eslint.config.mjs](eslint.config.mjs) (verified from [package.json](package.json))
- **Lint (Fix):** `npm run lint:fix` — Auto-fix linting issues (verified from [package.json](package.json))
- **Format:** `npm run format` — Prettier with `--write .` (verified from [package.json](package.json))
- **Clean:** `npm run clean` — Remove build artifacts via [scripts/tasks.mjs](scripts/tasks.mjs) (verified)
- **CI Verification:** **UNVERIFIED** — No CI workflow found (no `.github/workflows/` directory). For CI, run: `npm run lint && npm run type-check && npm run build && npm test`

## 4) Coding Standards (Style & Patterns)

### Style Configuration

- **TypeScript (Strict):** All strict flags enabled in [tsconfig.json](tsconfig.json):
  - `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, `useUnknownInCatchVariables: true`
  - Explicit return types required (see [eslint.config.mjs](eslint.config.mjs) `@typescript-eslint/explicit-function-return-type`)
- **ESLint:** TypeScript ESLint strict + stylistic configs (see [eslint.config.mjs](eslint.config.mjs)):
  - `typescript-eslint/configs/strictTypeChecked` + `stylisticTypeChecked`
  - Plugins: `sonarjs`, `eslint-plugin-de-morgan`, `eslint-plugin-depend`, `eslint-plugin-unused-imports`
  - Enforces: explicit return types, consistent type imports (`type` keyword), naming conventions, no `any`, require await, no floating promises
- **Prettier:** Auto-formatting with import sorting (see [package.json](package.json) `@trivago/prettier-plugin-sort-imports`)
- **Module System:** ES modules (`"type": "module"` in [package.json](package.json)), `NodeNext` resolution (see [tsconfig.json](tsconfig.json))

### Naming Conventions

Enforced via [eslint.config.mjs](eslint.config.mjs) `@typescript-eslint/naming-convention`:

- **Variables:** `camelCase`, `UPPER_CASE` (constants), or `PascalCase` (constructors)
- **Functions/Methods:** `camelCase`
- **Types/Interfaces/Classes:** `PascalCase`
- **Enum Members:** `PascalCase` or `UPPER_CASE`

### Code Structure Patterns

Observed from [src/](src/) and [tests/](tests/):

- **Layering:** Core logic in `src/core/`, MCP protocol in `src/`, tests in `tests/` (see repository structure)
- **Dependency Injection:** Core functions accept dependencies as parameters (e.g., `signal?: AbortSignal`) (observed in [src/core/search.ts](src/core/search.ts), [src/tools.ts](src/tools.ts))
- **Error Handling:** Wrapped in MCP envelope `{ ok: true|false, result|error }` (observed in [src/tools.ts](src/tools.ts))
- **Type Safety:** Zod schema validation at MCP boundary (see [src/schemas.ts](src/schemas.ts)), strict TypeScript internally
- **Imports:** Explicit `.js` extensions required for local imports (TypeScript `verbatimModuleSyntax: true` in [tsconfig.json](tsconfig.json))
- **Test Setup:** Use `before()`/`after()` hooks at `describe` level for DB init/cleanup, **not** per-test (pattern observed in [tests/memory-service-core.test.ts](tests/memory-service-core.test.ts), [tests/tools.test.ts](tests/tools.test.ts))

## 5) Agent Behavioral Rules (Do Nots)

- **Do not bypass Node.js version requirement.** This server requires Node.js >=24 for native `node:sqlite`. (see [package.json](package.json) `engines`, [README.md](README.md) Troubleshooting)
- **Do not edit `package-lock.json` manually.** Use `npm install` to update dependencies. (lockfile present: [package-lock.json](package-lock.json))
- **Do not disable strict TypeScript flags.** All strict options in [tsconfig.json](tsconfig.json) are intentional for type safety.
- **Do not disable or bypass ESLint rules without approval.** Rules in [eslint.config.mjs](eslint.config.mjs) enforce critical patterns (e.g., explicit return types, no `any`, no floating promises).
- **Do not commit secrets or print `.env` values.** Config uses environment variables (see [src/config.ts](src/config.ts), [README.md](README.md) Configuration).
- **Do not introduce new dependencies without updating `package.json` via `npm install`.** (see [package.json](package.json))
- **Do not modify MCP tool schemas without updating both input and output schemas.** (see [src/schemas.ts](src/schemas.ts))
- **Do not change database schema SQL without migration plan.** Schema defined in [src/core/db.ts](src/core/db.ts) `SCHEMA_SQL`.
- **Do not use `any` type.** ESLint rule `@typescript-eslint/no-explicit-any: error` enforced (see [eslint.config.mjs](eslint.config.mjs)).
- **Do not skip return type annotations for functions.** ESLint rule `@typescript-eslint/explicit-function-return-type: error` enforced (see [eslint.config.mjs](eslint.config.mjs)).

## 6) Testing Strategy (Verified)

- **Framework:** Native Node.js test runner `node:test` (see [tests/](tests/) imports, [scripts/tasks.mjs](scripts/tasks.mjs))
- **Test Location:** `tests/*.test.ts` (11 test files; see [tests/](tests/))
- **Test Runner Invocation:** `npm test` runs [scripts/tasks.mjs](scripts/tasks.mjs) which executes tests with optional coverage (verified)
- **Test Approach:**
  - **Unit Tests:** Core functions isolated (see [tests/memory-service-core.test.ts](tests/memory-service-core.test.ts), [tests/row-mappers.test.ts](tests/row-mappers.test.ts))
  - **Integration Tests:** Tool handlers with in-memory database (see [tests/tools.test.ts](tests/tools.test.ts))
  - **E2E Tests:** Protocol version negotiation (see [tests/protocol-version-e2e.test.ts](tests/protocol-version-e2e.test.ts))
  - **Schema Validation Tests:** Input/output schema coverage (see [tests/schemas-inputs.test.ts](tests/schemas-inputs.test.ts), [tests/schemas-outputs.test.ts](tests/schemas-outputs.test.ts))
- **Database Setup Pattern:**
  - Set `process.env.MEMDB_PATH = ':memory:'` **before** imports (observed in [tests/memory-service-core.test.ts](tests/memory-service-core.test.ts))
  - Use `before()`/`after()` hooks at `describe` level to call `initDb()`/`closeDb()` (observed in [tests/memory-service-core.test.ts](tests/memory-service-core.test.ts))
  - **Do NOT** initialize per-test with `try/finally` blocks (causes "Database not initialized" errors)
- **Assertions:** `node:assert/strict` for all assertions (observed in test files)
- **Mocking:** Minimal; uses server stubs for tool registration tests (see [tests/tools.test.ts](tests/tools.test.ts) `createServerStub`)

## 7) Common Pitfalls (Verified)

- **Node.js Version Mismatch:** Error "`node:sqlite` not found" → You are running Node.js <24. **Solution:** Upgrade to Node.js >=24. (see [README.md](README.md) Troubleshooting, [package.json](package.json) `engines`)
- **Test Database Errors ("Database not initialized"):** Setting `MEMDB_PATH=':memory:'` per-test instead of before imports. **Solution:** Set `process.env.MEMDB_PATH = ':memory:'` at the **top** of test files before any imports. (observed pattern in [tests/memory-service-core.test.ts](tests/memory-service-core.test.ts))
- **Test Lifecycle Issues:** Using `try/finally` per-test for `initDb()`/`closeDb()` instead of `before()`/`after()` hooks. **Solution:** Use `before()`/`after()` at `describe` level. (pattern from [tests/memory-service-core.test.ts](tests/memory-service-core.test.ts))
- **SQLite Locked Errors:** Accessing `.memdb/memory.db` with external tools while server is running. **Solution:** Server uses WAL mode; close server before external DB access. (see [README.md](README.md) Troubleshooting)
- **Missing FTS5:** Uncommon, but if FTS errors occur, ensure Node.js binary includes standard SQLite extensions. (see [README.md](README.md) Troubleshooting)
- **Import Path Errors:** Forgetting `.js` extension in local imports. **Solution:** Always use `.js` extension for local module imports (required by `verbatimModuleSyntax: true` in [tsconfig.json](tsconfig.json)).

## 8) Evolution Rules

- **Convention Changes:** If coding conventions or standards change, include an update to this `AGENTS.md` in the same PR.
- **Command Corrections:** If a command fails and is corrected, update the relevant command section with verified evidence (file path citation).
- **New Patterns:** If a new critical architectural pattern or pitfall is discovered, add it to the relevant section with file path evidence.
- **Dependency Updates:** When adding/removing dependencies, ensure `package.json` and `package-lock.json` are updated via `npm install`.
- **Schema Changes:** When modifying MCP tool schemas in [src/schemas.ts](src/schemas.ts), update corresponding tests in [tests/schemas-inputs.test.ts](tests/schemas-inputs.test.ts) and [tests/schemas-outputs.test.ts](tests/schemas-outputs.test.ts).
