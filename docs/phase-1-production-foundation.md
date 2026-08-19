# Phase 1 production foundation

## Scope and UX contract

The Employee Work Screen at `360e91d` is the frozen behavioral and visual contract. Phase 1 changes its internal state and validation boundaries without changing the approved layout, button placement, keyboard-first flow, F1/F2 behavior, explicit NONE behavior, condition selection, progress semantics, or normal no-scroll workflow.

## Domain and validation

`@workspace/domain` is independent of React, Express, Drizzle, OpenAI, CSV parsers, and database implementations. It owns stable IDs, condition codes, batches, listing items, questions, conditional fields, one `ItemDraft`, review reasons, workflow states, error categories, pure validation, progress calculation, and legal transitions.

The Employee screen retains hidden field values in its current local draft for convenience. `validateEmployeeAnswer` ignores hidden fields for readiness and removes them from `normalizedAnswer`; only visible/applicable values are authoritative on submission. The API re-runs the same validation.

## Workflow transitions

Legal transitions are declared in `lib/domain/src/workflow.ts`. `completed` and `needs_review` both count as processed. A batch is complete only when it contains at least one item and its pending count is zero. `processing_failed` is distinct from employee `needs_review`.

## Persistence schema

The migration creates `batches`, `listing_items`, `item_drafts`, `review_records`, `audit_events`, `processing_jobs`, and `idempotency_records`. Original source values and normalized values remain separate. Listing items and drafts carry versions. Audit events are append-only and store actor, role, action, previous/new status, correlation ID, and limited metadata rather than raw sensitive payloads. Processing-job status is a controlled database enum; `job_type` deliberately remains extensible nonempty text so future adapters can introduce job identifiers without weakening the controlled lifecycle states.

## Save and idempotency contract

Employee writes require an authenticated identity, route/body item match, item version, and `Idempotency-Key`. The service binds employee identity to the authenticated subject, rejects stale versions, validates the answer, records the state transition, writes one audit event, and returns the next pending item. Replaying the same key and request returns the original response with `replayed: true`; reusing a key for a different request returns `409 CONFLICT`.

The authoritative idempotency namespace is `actorId + operation + key`; the current employee operation is `employee_item_write`. The payload hash includes the item draft and review reason. An active key replays only an identical payload; a changed payload (including a different item for the same actor/operation/key) returns `409 CONFLICT`. Different actors have separate namespaces. Records expire after 24 hours, are removed under the scoped transaction lock, and may then be reused. A retry after a committed transaction returns the schema-validated stored response without another transition, draft, review, audit, or processing effect.

The in-memory repository is explicitly a development/test adapter and implements the same namespace, conflict, expiration, and reuse rules. `PostgresItemWriteRepository` uses one PostgreSQL transaction, a transaction-scoped advisory lock, row locking, optimistic item versioning, answer/review writes, audit insertion, next-item selection, and idempotency response storage.

## Needs Review

Needs Review is a distinct business action. It retains entered answers and records typed reason code, optional note, employee, timestamp, item version, source state, item status, and an audit event. It does not require the normal completion validation and does not use a confirmation modal.

## API and errors

The executable OpenAPI surface contains exactly three operations: `GET /api/healthz`, `PUT /api/items/{itemId}/answer`, and `POST /api/items/{itemId}/needs-review`. Batch, current-item, restoration, draft-save, and other planned APIs are future work and must not enter executable OpenAPI until their Express foundation exists. Writes expose bad-request (`400`), validation (`422`), conflict (`409`), authentication (`401`), authorization (`403`), not-found (`404`), rate-limit (`429`), and system (`500`) boundaries. AI processing failures use a separate error code.

## Security boundary

The production contract is OIDC-style bearer authentication, but a trusted provider has not been selected or implemented in Phase 1. The `x-development-user` adapter is nonproduction test/development infrastructure only, is disabled by default, requires explicit enablement, and cannot operate in production. Production startup fails closed until a trusted provider replaces it. The Express foundation also adds an environment allowlist for CORS, generated correlation IDs, safe headers, small JSON/form limits, structured error responses, sensitive log redaction, a write-rate boundary, server-only environment access, and authenticated role checks. Browser-supplied employee IDs are never trusted independently of the authenticated subject.

## CSV/SixBit and OpenAI boundaries

`CsvListingAdapter` separates file validation, immutable original rows, normalization, and export projection from React. No SixBit database or live system is connected.

`ListingAiProcessor` accepts a prompt ID/version, approved structured input, timeout, and typed output. Results include model, usage, optional cost, and latency. Production implementations must validate structured output before workflow use and must keep deterministic inventory/readiness rules outside the model. No OpenAI request is made in Phase 1.

## Remaining deployment decisions

- Select and configure the production identity/session provider.
- Continue running the migrations and transactional repository suite in the disposable PostgreSQL 16 CI service. The suite verifies seven tables, critical constraints, concurrent identical replay, competing/stale writers, cross-actor/cross-item scope, expiration reuse, full workflow rollback, audit immutability, and retry after committed-response loss.
- Select controlled object storage and upload malware/file-policy enforcement before CSV ingestion is enabled.
- Approve prompt/model policy before any OpenAI implementation.

## Deployment boundary

Phase 1 is an engineering foundation only. It authorizes no production deployment, live SixBit connection, live OpenAI call, production credential/data use, employee rollout, or Phase 2 work.
