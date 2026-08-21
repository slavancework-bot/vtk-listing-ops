# Phase 3 deterministic listing engine and SixBit CSV workflow

Phase 3 is a controlled nonproduction workflow. It does not connect to a live SixBit database or importer, call OpenAI, deploy, or authorize rollout.

## Versions and boundaries

- CSV adapter: `sixbit-listing-v1`
- deterministic rules: `listing-rules-v2`
- accepted input: bounded UTF-8 CSV through `/api/phase3/batches/import`
- production filesystem storage remains forbidden; staging retains the Phase 2 descriptor-anchored storage contract
- React and generated clients consume normalized API objects and never parse raw SixBit layout

The adapter maps explicit aliases to canonical columns, rejects ambiguous duplicate aliases, preserves every unknown header/value, and stores the source checksum, exact headers, mapping, row number, exact original values, and normalized values separately. Original JSON is never updated. Rule results, repairs, employee answers, reviewer decisions, export values/checksum, and field-level diffs have separate persistence records.

## Deterministic workflow

Import → analyze → apply safe repairs → ask only unresolved deterministic questions → persist employee evidence → rerun the same rule version → retain unresolved rows → persist an idempotent reviewer decision → require every row to be resolved → export a new CSV → reparse and validate it.

Rules return rule ID/version, category, outcome (`PASS`, `FAIL`, `VERIFY`, or `PASS_EMPLOYEE_VERIFIED`), resolution class (employee, reviewer, or non-overridable hard invalid), severity, field/value, reason, optional safe repair, and employee/reviewer requirements. Repairs are limited to no-invention spacing/approved abbreviation normalization and the required Zebra labels/media disclosure. Missing or invalid R2 values are never guessed and always create an employee question. Quantity overrides require a matching authorized quantity, approved evidence code, bounded reason, and evidence source. `StockTotal` is never mutated to satisfy another rule. LOT/KIT parsing requires an explicit whole-number token from 1 through 1000 and ignores model-like numbers.

Quantity truth table:

| Listing state                     | Evidence                                         | Required Check Count | Failure behavior                         |
| --------------------------------- | ------------------------------------------------ | -------------------- | ---------------------------------------- |
| Unlisted (`QtyCurrentlyListed=0`) | `QtyUncommitted-QtyToList=0`                     | `FALSE`              | mismatched value is employee-resolvable  |
| Unlisted (`QtyCurrentlyListed=0`) | difference `=1`                                  | `TRUE`               | mismatched value is employee-resolvable  |
| Unlisted (`QtyCurrentlyListed=0`) | any other difference                             | none                 | hard invalid; cannot be reviewed through |
| Listed (`QtyCurrentlyListed>0`)   | unchanged listed quantity and no sold quantity   | `FALSE`              | mismatched value is employee-resolvable  |
| Listed (`QtyCurrentlyListed>0`)   | changed listed quantity or sold quantity present | `TRUE`               | mismatched value is employee-resolvable  |
| Listed                            | unsupported or ambiguous `ItemStatus`            | none                 | hard invalid; cannot be reviewed through |

Exports use the original header order, preserve raw pass-through values and row count, correctly quote commas/quotes/newlines, avoid numeric coercion, never overwrite the source, and persist checksum/version/provenance. Formula-like raw values are intentionally preserved because this is a SixBit interchange artifact rather than a spreadsheet-view safety transform. Mutations are fail-closed to Title, eBay Description, R2Code, and Check Count. Production operators must validate the controlled CSV before any separate manual SixBit import.

## Security and operational limits

Identity and role middleware covers every route. Employees can access only their own batches; reviewers/admins may resolve and export. Import/body/rate limits remain enforced. The adapter rejects malformed CSV, blank/duplicate/ambiguous headers, missing required headers, duplicate listing identities, NUL bytes, negative/unsafe numeric values, oversized files/row counts, and wrong-width rows. Safe filenames and generated storage keys prevent caller-controlled paths.

Rule-version changes create an explicit new analysis identity; they do not silently mutate the previous version. Import, analysis, questions, employee answers, reviewer decisions, and exports are retry-safe. Unknown or unresolved rows remain stored and cannot disappear from export eligibility accounting.

## Acceptance matrix

| Requirement             | Implementation                                                             | Exact test / real path          | Assertion                                         | Result                 |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------- | ---------------------- |
| CSV mapping and aliases | `phase3.ts` adapter                                                        | `phase3.test.ts`                | canonical mapping; ambiguous aliases rejected     | PASS                   |
| Immutable original      | `listing_items.original_values`                                            | Phase 3 PostgreSQL E2E          | before/after JSON equality                        | PASS                   |
| Title                   | `TITLE.*` rules                                                            | domain goldens                  | whole-word bans, 74–80 target, identity retained  | PASS                   |
| Description             | `DESCRIPTION.ZEBRA_MEDIA`                                                  | domain goldens                  | deterministic disclosure only                     | PASS                   |
| R2                      | `R2.REQUIRED`                                                              | domain + PostgreSQL E2E         | missing code asks; evidence reruns                | PASS                   |
| Quantity/check count    | `QUANTITY.*`                                                               | domain goldens                  | 0/1 difference and explicit override              | PASS                   |
| StockTotal              | preservation rule/export                                                   | domain + PostgreSQL E2E         | byte-semantic original retained                   | PASS                   |
| LOT/KIT                 | explicit-token parser                                                      | domain goldens                  | LOT parsed; model 12D ignored                     | PASS                   |
| Questions               | stable `q:*` IDs + Phase 3 Employee Work Screen                            | domain + PostgreSQL browser E2E | generated question answered and rules revalidated | PASS                   |
| Auto-repair             | versioned repair records                                                   | domain goldens                  | before/after/reason/version                       | PASS                   |
| Preserve row            | export row-count gate                                                      | domain + PostgreSQL E2E         | unresolved retained; no deletion                  | PASS                   |
| Reviewer                | `listing_analyses.reviewer_decision`                                       | PostgreSQL E2E                  | decision and replay persisted                     | PASS                   |
| Export/round trip       | `exportSixBitCsv`                                                          | domain + PostgreSQL E2E         | escaping, formula safety, unknown fields          | PASS                   |
| Security                | middleware + parser limits                                                 | route/domain/Phase 2 regression | access and malformed inputs fail closed           | PASS                   |
| Idempotency             | import keys, rule identity, answer records, decision keys, export checksum | PostgreSQL E2E                  | replay without duplicate effects                  | PASS                   |
| Real path               | API + PostgreSQL + Phase 3 Employee Work Screen                            | `test:postgres` + Playwright    | import through UI evidence/revalidation/export    | PASS in CI environment |
| Phase 2 regression      | unchanged suites plus strengthened filesystem tests                        | workspace/CI suites             | existing behavior remains green                   | PASS                   |

## Performance

Parsing, analysis, question generation, and export are linear in row/field count. Export reparses once for validation/diffs and uses indexed item/rule and item/question lookups. Queues/Redis are intentionally absent because current synthetic batches do not justify them.
