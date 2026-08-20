# Phase 2 controlled nonproduction integration

Phase 2 runs only with `APP_ENV=staging`, a disposable/nonproduction `DATABASE_URL`, `ALLOW_NONPRODUCTION_DATABASE=true`, `ALLOW_DEVELOPMENT_IDENTITY=true`, `ALLOW_NONPRODUCTION_STORAGE=true`, and a dedicated `STAGING_FILE_ROOT`. Startup fails closed if the application environment is missing or production, and the development identity and filesystem storage adapters reject production mode.

## Controlled CSV schema

Schema version `vtk-controlled-test-v1` has an exact ordered header defined by `CONTROLLED_HEADERS`. It is intentionally not the SixBit schema. JSON arrays encode included-question and conditional-field configuration. The server validates extension, media type, UTF-8/null bytes, 256 KiB size, 1,000-row maximum, exact headers, schema version, column count, JSON structure, and required values. Original and normalized values are stored separately with row numbers, checksum, safe filename metadata, and an opaque storage key.

An exact repeated `(actor, importKey, content)` request replays the original batch. Reusing the key with different content returns conflict. Duplicate content with a new import key deliberately creates a new batch. Storage is written before the database transaction and removed if the transaction fails; a committed transaction is authoritative if the response is lost.

Phase 3 may introduce a separate versioned SixBit adapter behind the same import service boundary. It must not silently reinterpret this controlled schema.

## Draft and navigation policy

The Employee screen uses a short debounced draft save while editing and forces a draft save before manual navigation. Draft reads return `draftVersion`; saves require `expectedDraftVersion`, with zero meaning create. Every changed save increments the draft version, and a stale tab receives `409 CONFLICT`. Per-item save chains order autosave, navigation, and final/review work so an older snapshot cannot land after a newer or final state.

A final Save & Next or Needs Review is authoritative: the screen advances only after the server confirms the write. One idempotency key is retained for each semantically identical logical operation across transport retries and cleared only after authoritative reconciliation. Needs Review comparison ignores timestamps but includes item/version, employee, draft status, included/NONE selection, condition, conditional values, notes, and reason. If visible input changes after an uncertain response, the client first reads the authoritative item: a prior committed result is reported explicitly while the changed visible input remains on screen until navigation, while a confirmed pre-commit failure permits the changed operation under a new key. A later progress-refresh failure is reported as a reconciliation warning rather than misclassifying the committed write. Final item transactions lock the parent batch before counting pending items; the batch changes to completed once and emits one `batch_completed` event.

## Resource access policy

Employees may enumerate, read, draft, complete, or mark Needs Review only for batches they created (`batches.created_by`) and their items. Admin may read and write all batches. Reviewer may read all batches/items but cannot call employee write or next-work operations. Unauthorized known IDs return non-enumerating `404`; a body employee ID never grants access.

## Storage and parser policy

The filesystem root must be a dedicated operator-controlled nonproduction directory. The adapter walks every existing root component with `lstat` before and after root creation and fails closed on symbolic-link redirects. On Linux it opens the canonical root as a no-follow directory descriptor and performs generated-key create/remove through `/proc/self/fd`; root identity is rechecked around each operation, while the descriptor keeps the actual file operation bound to the verified directory even if the configured pathname is concurrently renamed or replaced. UUID keys are generated internally, files are created exclusively with no-follow semantics, and failed imports remove their staged file through the same bound directory. Deterministic tests replace the root with a symlink exactly after verification and prove zero external create/delete effects. Portable Node does not expose equivalent directory-relative primitives on Windows, so this adapter refuses non-Linux platforms rather than falling back to unsafe pathname-only behavior. Use approved object storage for production or any unsupported platform.

The bounded CSV parser supports BOM/CRLF, commas, escaped quotes, and newlines inside quoted fields. Both limits are inclusive: a valid 256 KiB document and exactly 1,000 data rows are accepted; one additional byte or row is rejected. CI timings are operational observations, not an SLA; no cache, queue, or other performance infrastructure was added.

## Provider owner actions

Before any production deployment, provide an approved OIDC/session identity adapter and object-storage adapter, then remove the nonproduction development headers from the browser composition. No live SixBit or OpenAI connection exists in this phase.

## Migration recovery

Migration `0003_phase2_controlled_integration.sql` is additive. Apply it first to a disposable database and then to staging. Automated down-migration is intentionally not provided; recovery is restore-from-snapshot or removal of the new table/columns only after verifying no Phase 2 data must be retained.
