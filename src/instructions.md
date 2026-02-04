# memdb Instructions

> Guidance for the Agent: These instructions are available as a resource (`internal://instructions`) or prompt (`get-help`). Load them when you are unsure about tool usage.

## 1. Core Capability

- **Domain:** Local SQLite-backed memory store with vector-like text search and graph relationships.
- **Primary Resources:** `Memory`, `Relationship`, `Stats`.

## 2. The "Golden Path" Workflows (Critical)

_Describe the standard order of operations using ONLY tools that exist._

### Workflow A: Recall & Exploration

1. Call `search_memories` to find entry points by content/tags.
2. Call `recall` (depth 1–2) to traverse the knowledge graph from relevant hits.
3. Call `get_memory` using the `hash` (SHA-256) for exact retrieval.
   > Constraint: Never guess hashes. Always search or recall first.

### Workflow B: Knowledge Management

1. Call `store_memory` (single) or `store_memories` (batch) to add context.
2. Call `create_relationship` to link related memories (directed).
3. Call `update_memory` to revise; this changes the hash.
4. Call `delete_memory` only with user confirmation.

## 3. Tool Nuances & Gotchas

_Do NOT repeat JSON schema. Focus on behavior and pitfalls._

- **`search_memories`**
  - **Purpose:** Full-text search over content and tags.
  - **Inputs:** `query` string (required).
  - **Common failure modes:** Empty results for too-specific queries; try broader terms.

- **`recall`**
  - **Purpose:** Graph traversal starting from a defined query.
  - **Inputs:** `query` string; `depth` (default 1, max 3 recommended).
  - **Latency:** Higher depth increases time/token usage significantly.

- **`store_memory` / `store_memories`**
  - **Purpose:** Persist new information.
  - **Inputs:** `content` (text), `tags` (array of strings).
  - **Side effects:** Writes to DB. Idempotent if content/tags identical (same hash).

- **`update_memory`**
  - **Inputs:** `hash` (must exist), new `content`/`tags`.
  - **Side effects:** Creating a new memory hash; effectively a "move" + "create".

- **`create_relationship`**
  - **Inputs:** `from_hash`, `to_hash`, `relation_type` (e.g., "related_to").
  - **Constraint:** Both hashes must exist.

## 4. Error Handling Strategy

- **`E_NOT_FOUND`**: The hash doesn't exist. Re-run search/recall.
- **`E_TIMEOUT`**: Operation took too long (>5s default). Reduce batch size or depth.
- **`E_INVALID_ARG`**: Check inputs against schema (e.g. valid hashes).
