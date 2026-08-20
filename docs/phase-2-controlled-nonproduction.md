# Phase 2 controlled nonproduction integration

Phase 2 runs only with `APP_ENV=staging`, a disposable/nonproduction `DATABASE_URL`, `ALLOW_NONPRODUCTION_DATABASE=true`, `ALLOW_DEVELOPMENT_IDENTITY=true`, `ALLOW_NONPRODUCTION_STORAGE=true`, and a dedicated `STAGING_FILE_ROOT`. Startup fails closed if the application environment is missing or production, and the development identity and filesystem storage adapters reject production mode.

## Controlled CSV schema

Schema version `vtk-controlled-test-v1` has an exact ordered header defined by `CONTROLLED_HEADERS`. It is intentionally not the SixBit schema. JSON arrays encode included-question and conditional-field configuration. The server validates extension, media type, UTF-8/null bytes, 256 KiB size, 1,000-row maximum, exact headers, schema version, column count, JSON structure, and required values. Original and normalized values are stored separately with row numbers, checksum, safe filename metadata, and an opaque storage key.

An exact repeated `(actor, importKey, content)` request replays the original batch. Reusing the key with different content returns conflict. Duplicate content with a new import key deliberately creates a new batch. Storage is written before the database transaction and removed if the transaction fails; a committed transaction is authoritative if the response is lost.

Phase 3 may introduce a separate versioned SixBit adapter behind the same import service boundary. It must not silently reinterpret this controlled schema.

## Draft and navigation policy

The Employee screen uses a short debounced draft save while editing and forces a draft save before manual navigation. A final Save & Next or Needs Review is authoritative: the screen advances only after the server confirms the write. Draft and final writes carry the loaded item version; stale sessions receive `409 CONFLICT` and cannot overwrite newer work. Progress is always reloaded from persisted item status.

## Provider owner actions

Before any production deployment, provide an approved OIDC/session identity adapter and object-storage adapter, then remove the nonproduction development headers from the browser composition. No live SixBit or OpenAI connection exists in this phase.

## Migration recovery

Migration `0003_phase2_controlled_integration.sql` is additive. Apply it first to a disposable database and then to staging. Automated down-migration is intentionally not provided; recovery is restore-from-snapshot or removal of the new table/columns only after verifying no Phase 2 data must be retained.
