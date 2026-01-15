# AGENTS.md

> **Purpose:** Context and strict guidelines for AI agents working in this repository.

## 1. Project Context

- **Domain:** Local, SQLite-backed MCP “memory server” (stdio) for storing/searching tagged text memories.
- **Tech Stack:**
  - **Language:** TypeScript (strict) targeting Node.js ESM (NodeNext)
  - **Runtime:** Node.js `>= 22.0.0` (uses `node:sqlite`)
  - **Key Libraries:** `@modelcontextprotocol/sdk` (MCP server), `zod` (schemas/validation)
- **Architecture:** Layered: MCP wiring (`src/`) → DB/operations (`src/core/`) → schemas/types.

## 2. Repository Map (High-Level Only)

- `src/`: MCP server entrypoint, stdio transport, tool registration, schemas, config, logging.
- `src/core/`: SQLite schema/init + memory CRUD/search + relationship graph.
- `tests/`: Node.js test runner tests for tools/core behavior (uses in-memory DB via `MEMDB_PATH=':memory:'`).
- `.github/`: CI workflow, agent prompts/instructions used by automated tooling.
- `scripts/`, `metrics/`: Quality gate scripts and metric snapshots.

> Note: ignore `dist/`, `node_modules/`, and local `.memdb/` databases.

## 3. Operational Commands

- **Environment:** Requires Node.js `>= 22.0.0`.
- **Install:** `npm install` (or `npm ci` in CI)
- **Dev Server:** `npm run dev` (watches `src/index.ts` via `tsx`)
- **Test:** `npm run test` (Node’s built-in runner via `node --test`)
- **Build:** `npm run build` (emits `dist/`)

## 4. Coding Standards (Style & Patterns)

- **Naming:** `camelCase` for vars/functions, `PascalCase` for types/classes.
- **Typing:** Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Imports:** ESM + NodeNext; local imports use `.js` extensions. Prefer type-only imports (`import { type X } ...`).
- **Tool Responses:** Tools return `structuredContent` and also mirror it as JSON in `content[0].text` for backward compatibility.
- **Preferred Patterns:**
  - Parse/validate tool inputs with Zod (`z.strictObject(...)`), reject unknown fields.
  - Centralized helpers for error normalization (convert `unknown` → message) and consistent `{ ok, result | error }` outputs.

## 5. Agent Behavioral Rules (The “Do Nots”)

- **Prohibited:** Do not write anything except MCP protocol traffic to stdout (log to stderr).
- **Prohibited:** Do not introduce `any` (lint forbids it).
- **Prohibited:** Do not remove `.js` extensions from local imports or switch away from NodeNext ESM.
- **Prohibited:** Do not change tool output shape casually; keep `structuredContent` + JSON string mirror.
- **Prohibited:** Do not edit lockfiles manually (`package-lock.json`).
- **Handling Secrets:** Never hardcode secrets; do not print or persist credentials/tokens.
- **Stateful/Destructive Ops:** Treat delete operations as destructive; require explicit user intent before deletion.

## 6. Testing Strategy

- **Framework:** Node.js built-in test runner (`node:test`) with `tsx` ESM loader.
- **Approach:** Mostly integration-style unit tests around tool handlers and core DB behavior; tests commonly stub `McpServer.registerTool` and use `MEMDB_PATH=':memory:'`.

## 7. Evolution & Maintenance

- **Update Rule:** If conventions or commands change, update this file in the same PR.
- **Feedback Loop:** If a build/test/lint command fails twice, record the root cause + fix under “Common Pitfalls”.

### Common Pitfalls

- Node version drift: `node:sqlite` requires Node `>= 22.0.0`; ensure CI/dev match `package.json` engines.
- Search depends on SQLite FTS5 availability; missing FTS5 manifests as index/FTS errors.
