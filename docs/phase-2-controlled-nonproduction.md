# Phase 2 controlled nonproduction integration

Phase 2 runs only with `APP_ENV=staging`, a disposable/nonproduction `DATABASE_URL`, `ALLOW_NONPRODUCTION_DATABASE=true`, `ALLOW_DEVELOPMENT_IDENTITY=true`, `ALLOW_NONPRODUCTION_STORAGE=true`, and the descriptor-anchored storage configuration described below. Startup fails closed if the application environment is missing or production, and the development identity and filesystem storage adapters reject production mode.

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

The filesystem adapter is Linux-only and nonproduction-only. It requires an application-owned parent directory prepared by a trusted launcher (use mode `0700`), an absolute operator-verified `STAGING_TRUSTED_PARENT_PATH`, and an absolute child `STAGING_FILE_ROOT`. Before importing the application routes, the server bootstrap opens the parent with `O_DIRECTORY | O_NOFOLLOW`, retains that descriptor for the process lifetime, and passes only its descriptor number to the adapter. The trusted parent and every existing child component must be owned by the application user and must not be group- or world-writable. Startup/use fails closed if the parent cannot be opened, the descriptor is absent or changes during duplication, ownership/mode is unsafe, or the configured root is not lexically below the declared parent. An arbitrary user-selected writable directory is not a trusted parent; securing the parent path and its ancestors before bootstrap remains an operator/launcher responsibility.

Initial trust is derived from the device/inode identity of descriptors, never from `realpath(STAGING_FILE_ROOT)`. The adapter duplicates the bootstrap parent through `/proc/self/fd`, verifies the source and duplicate identities, and traverses or creates each child relative to the already trusted descriptor. Every child is opened with `O_DIRECTORY | O_NOFOLLOW`; the final descriptor is independently reacquired through the same traversal before its identity is cached. Store and remove remain bound to that descriptor, use generated exclusive/no-follow file keys, and re-traverse from the trusted parent around each effect. All operation-owned descriptors close on success and failure; the bootstrap descriptor remains bootstrap-owned for the process lifetime.

Deterministic tests replace the final root and an ancestor at the actual pre-trust acquisition boundary, prove the replacements succeeded, and verify controlled refusal with zero external writes/deletes and no cached failed identity. Existing tests retain post-binding create/remove replacement, final/intermediate symlink rejection, redirected removal, normal store/remove, import cleanup/replay, repeated descriptor cleanup, production prohibition, and unsupported-platform failure. The trusted launcher descriptor is the threat boundary: this adapter does not protect against a compromised launcher, a malicious holder that closes/reuses the inherited descriptor, or an attacker already running as the application user with access to its process descriptors. Portable Node does not expose equivalent primitives on Windows, so no pathname-only fallback exists. Use approved object storage for production or any unsupported platform.

The bounded CSV parser supports BOM/CRLF, commas, escaped quotes, and newlines inside quoted fields. Both limits are inclusive: a valid 256 KiB document and exactly 1,000 data rows are accepted; one additional byte or row is rejected. CI timings are operational observations, not an SLA; no cache, queue, or other performance infrastructure was added.

## Provider owner actions

Before any production deployment, provide an approved OIDC/session identity adapter and object-storage adapter, then remove the nonproduction development headers from the browser composition. No live SixBit or OpenAI connection exists in this phase.

## Migration recovery

Migration `0003_phase2_controlled_integration.sql` is additive. Apply it first to a disposable database and then to staging. Automated down-migration is intentionally not provided; recovery is restore-from-snapshot or removal of the new table/columns only after verifying no Phase 2 data must be retained.
