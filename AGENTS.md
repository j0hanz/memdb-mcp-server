# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** SQLite-backed Memory Server for Model Context Protocol (MCP).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9+ (Verified: `tsconfig.json` target `ES2022`/`NodeNext`).
  - **Runtime:** Node.js >= 22.0.0 (Required for `node:sqlite`).
  - **Frameworks:** `@modelcontextprotocol/sdk`.
  - **Key Libraries:** `zod` (Validation), `node:sqlite` (Native synchronous SQLite).
- **Architecture:**
  - **Layered:** `src/core` (Database/Logic) -> `src/tools.ts` (MCP Interface) -> `src/index.ts` (Server Entry).
  - **Storage:** Local SQLite database with FTS5 text search (`node:sqlite`).

## 2) Repository Map (High-Level)

- `src/core/`: Database schema, migration, and core logical operations (`db.ts`, `search.ts`).
- `src/tools.ts`: MCP tool definitions and handlers.
- `src/index.ts`: Server entry point and MCP initialization.
- `scripts/`: Build and test automation (`tasks.mjs` is the task runner).
- `tests/`: Integration and End-to-End tests using Node.js native test runner.

## 3) Operational Commands (Verified)

- **Reviewing:** `node scripts/tasks.mjs` (Main task runner source).
- **Install:** `npm install` (or `npm ci` in CI).
- **Dev:** `npm run dev` (Runs `tsc --watch`).
- **Test:** `npm test` (Runs `node scripts/tasks.mjs test` -> `node --test`).
- **Build:** `npm run build` (Runs `node scripts/tasks.mjs build` -> cleaner + tsc + assets).
- **Lint:** `npm run lint` (`eslint .`).
- **Type Check:** `npm run type-check` (`tsc -p tsconfig.json --noEmit`).

## 4) Coding Standards (Style & Patterns)

- **Structure:**
  - Use `src/core/` for all database interactions.
  - Define Zod schemas in `src/schemas.ts` or close to usage.
- **Typing/Strictness:**
  - **Strict:** `tsconfig.json` has `strict: true` and `noUncheckedIndexedAccess: true`.
  - **Explicit:** Avoid `any`; use `unknown` with narrowing (seen in `db.ts` parsers).
- **Patterns Observed:**
  - **Synchronous DB:** `node:sqlite` calls are synchronous (`DatabaseSync`), wrapped in async functions in `src/core` only if needed for interface, but mostly sync logic.
  - **Safe Parsing:** Extensive usage of helper functions (`toSafeInteger`, `toString`) to parse untyped DB rows.
  - **FTS5:** Full-text search usage in SQLite (`memories_fts` table).

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce `better-sqlite3` or `sqlite3`; use the native `node:sqlite`.
- Do not downgrade Node.js engine requirement below 22.0.0.
- Do not make changes to `scripts/tasks.mjs` unless modifying the build system itself.
- Do not commit secrets/tokens.
- Do not use `console.log` for production logging; use the `Logger` pattern or MCP logging.
- Do not bypass `noUncheckedIndexedAccess` (check array access availability).

## 6) Testing Strategy (Verified)

- **Framework:** Node.js Native Test Runner (`node --test`).
- **Loader:** `tsx` (via `scripts/tasks.mjs` detection).
- **Where tests live:** `tests/*.test.ts`.
- **Approach:**
  - **Integration:** Tests run against a real SQLite database instance (often verified via temp files or memory).
  - **Tool-Centric:** Tests often instantiate the tools or server to verify MCP behavior (`tests/tools.test.ts`).

## 7) Common Pitfalls (Optional; Verified Only)

- **Node Version:** Failing to use Node 22+ will cause `node:sqlite` import errors.
- **Strict Null Checks:** `noUncheckedIndexedAccess` means `arr[0]` is always `T | undefined`. Must guard access.
- **Database Schema:** Schema is defined in `SCHEMA_SQL` in `src/core/db.ts`; migrations are not fully automated in a separate folder—edit carefully.

## 8) Evolution Rules

- Update this file if the Node.js requirement changes or if the testing framework is swapped (e.g. to Vitest).
- If `scripts/tasks.mjs` logic changes (e.g. adding new assets), update the Build command description.
