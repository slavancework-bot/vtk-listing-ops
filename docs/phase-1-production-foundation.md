# Phase 1 production foundation

## Scope and UX contract

The Employee Work Screen at `360e91d` is the frozen behavioral and visual contract. Phase 1 changes its internal state and validation boundaries without changing the approved layout, button placement, keyboard-first flow, F1/F2 behavior, explicit NONE behavior, condition selection, progress semantics, or normal no-scroll workflow.

## Domain and validation

`@workspace/domain` is independent of React, Express, Drizzle, OpenAI, CSV parsers, and database implementations. It owns stable IDs, condition codes, batches, listing items, questions, conditional fields, one `ItemDraft`, review reasons, workflow states, error categories, pure validation, progress calculation, and legal transitions.

The Employee screen retains hidden field values in its current local draft for convenience. `validateEmployeeAnswer` ignores hidden fields for readiness and removes them from `normalizedAnswer`; only visible/applicable values are authoritative on submission. The API re-runs the same validation.

## Workflow transitions

Legal transitions are declared in `lib/domain/src/workflow.ts`. `completed` and `needs_review` both count as processed. A batch is complete only when it contains at least one item and its pending count is zero. `processing_failed` is distinct from employee `needs_review`.

## Persistence schema

The migration creates `batches`, `listing_items`, `item_drafts`, `review_records`, `audit_events`, `processing_jobs`, and `idempotency_records`. Original source values and normalized values remain separate. Listing items and drafts carry versions. Audit events are append-only and store actor, role, action, previous/new status, correlation ID, and limited metadata rather than raw sensitive payloads.

## Save and idempotency contract

Employee writes require an authenticated identity, route/body item match, item version, and `Idempotency-Key`. The service binds employee identity to the authenticated subject, rejects stale versions, validates the answer, records the state transition, writes one audit event, and returns the next pending item. Replaying the same key and request returns the original response with `replayed: true`; reusing a key for a different request returns `409 CONFLICT`.

The in-memory repository is explicitly a development/test adapter. `PostgresItemWriteRepository` uses one PostgreSQL transaction, a transaction-scoped advisory lock, row locking, optimistic item versioning, answer/review writes, audit insertion, next-item selection, and idempotency response storage. Production startup rejects the development identity adapter until a trusted provider is configured.

## Needs Review

Needs Review is a distinct business action. It retains entered answers and records typed reason code, optional note, employee, timestamp, item version, source state, item status, and an audit event. It does not require the normal completion validation and does not use a confirmation modal.

## API and errors

OpenAPI contracts cover batch creation/list/get/progress, batch items, current employee item/restored draft, draft save, answer save, and Needs Review. Writes expose validation (`422`), conflict (`409`), authentication (`401`), authorization (`403`), not-found (`404`), rate-limit (`429`), and system (`500`) boundaries. AI processing failures use a separate error code.

## Security boundary

The Express foundation adds an environment allowlist for CORS, correlation IDs, safe headers, small JSON/form limits, structured error responses, sensitive log redaction, a write-rate boundary, server-only environment access, and authenticated role checks. Browser-supplied employee IDs are never trusted independently of the authenticated subject.

## CSV/SixBit and OpenAI boundaries

`CsvListingAdapter` separates file validation, immutable original rows, normalization, and export projection from React. No SixBit database or live system is connected.

`ListingAiProcessor` accepts a prompt ID/version, approved structured input, timeout, and typed output. Results include model, usage, optional cost, and latency. Production implementations must validate structured output before workflow use and must keep deterministic inventory/readiness rules outside the model. No OpenAI request is made in Phase 1.

## Remaining deployment decisions

- Select and configure the production identity/session provider.
- Execute the generated migration and transactional PostgreSQL repository tests against an isolated nonproduction PostgreSQL instance.
- Select controlled object storage and upload malware/file-policy enforcement before CSV ingestion is enabled.
- Approve prompt/model policy before any OpenAI implementation.
