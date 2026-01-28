# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** SQLite-backed MCP memory server with local workspace storage ([README.md](README.md)).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9+ ([package.json](package.json), [tsconfig.json](tsconfig.json)).
  - **Runtime:** Node.js >= 22 ([package.json](package.json), [README.md](README.md)).
  - **Frameworks/Protocols:** MCP SDK v1.x ([package.json](package.json)).
  - **Key Libraries:** @modelcontextprotocol/sdk, zod ([package.json](package.json)).
- **Architecture:** Single-package MCP server with stdio entrypoint and tool registry layered over a SQLite core ([src/index.ts](src/index.ts), [src/tools.ts](src/tools.ts), [src/core/db.ts](src/core/db.ts)).

## 2) Repository Map (High-Level)

- [src/](src/): Server entrypoint, tool registration, schemas, and SQLite core.
- [tests/](tests/): Node.js test runner specs.
- [scripts/](scripts/): Quality metrics artifacts and scripts.
- [.github/workflows/](.github/workflows/): CI/CD automation.
  > Ignore generated/vendor dirs like [dist/](dist/), [build/](build/), [node_modules/](node_modules/), [.venv/](.venv/), [\_\_pycache\_\_/](__pycache__/).

## 3) Operational Commands (Verified)

- **Environment:** Node.js >= 22 ([package.json](package.json)).
- **Install:** `npm ci` ([.github/workflows/publish.yml](.github/workflows/publish.yml)).
- **Dev:** `npm run dev` ([package.json](package.json)).
- **Test:** `npm run test` ([package.json](package.json), [.github/workflows/publish.yml](.github/workflows/publish.yml)).
- **Build:** `npm run build` ([package.json](package.json), [.github/workflows/publish.yml](.github/workflows/publish.yml)).
- **Lint/Format:** `npm run lint`, `npm run format`, `npm run format:check` ([package.json](package.json)).
- **Type-check:** `npm run type-check` ([package.json](package.json)).

## 4) Coding Standards (Style & Patterns)

- **Naming:** camelCase for variables/defaults, PascalCase for types, UPPER_CASE allowed for constants (ESLint rules in [eslint.config.mjs](eslint.config.mjs)).
- **Structure:**
  - Entry + transport wiring in [src/index.ts](src/index.ts).
  - Tool definitions and handlers in [src/tools.ts](src/tools.ts).
  - DB schema + data access in [src/core/](src/core/).
  - Zod schemas in [src/schemas.ts](src/schemas.ts).
- **Typing/Strictness:** TypeScript strict mode with NodeNext ESM, isolatedModules, and noUncheckedIndexedAccess ([tsconfig.json](tsconfig.json)).
- **Patterns Observed:**
  - Zod `z.strictObject()` schemas with constraints for tool inputs/outputs ([src/schemas.ts](src/schemas.ts)).
  - Tool handlers return structured responses with `content` + `structuredContent` ([src/tools.ts](src/tools.ts)).
  - SQLite access via node:sqlite with schema and row mappers ([src/core/db.ts](src/core/db.ts)).

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating manifests/lockfiles via the package manager ([package.json](package.json), [package-lock.json](package-lock.json)).
- Do not edit lockfiles manually ([package-lock.json](package-lock.json)).
- Do not commit secrets; never print `.env` values; use existing config mechanisms.
- Do not change public APIs without updating docs/tests and noting migration impact.
- Do not remove the shebang or change the entrypoint contract in [src/index.ts](src/index.ts).
- Do not drop `.js` extensions in local ESM imports (see [src/index.ts](src/index.ts), [src/tools.ts](src/tools.ts)).

## 6) Testing Strategy (Verified)

- **Framework:** Node.js built-in test runner (`node:test`) with `node:assert/strict` ([tests/memory-service-core.test.ts](tests/memory-service-core.test.ts)).
- **Where tests live:** [tests/](tests/) (`*.test.ts`).
- **Approach:** In-memory SQLite via `MEMDB_PATH=':memory:'` for unit-level core tests ([tests/memory-service-core.test.ts](tests/memory-service-core.test.ts)).

## 7) Common Pitfalls (Optional; Verified Only)

- Node < 22 lacks `node:sqlite` → upgrade Node to >= 22 ([README.md](README.md)).
- Missing FTS5 support causes search failures → ensure SQLite build includes FTS5 ([README.md](README.md)).

## 8) Evolution Rules

- If conventions change, include an AGENTS.md update in the same PR.
- If a command is corrected after failures, record the final verified command here.
