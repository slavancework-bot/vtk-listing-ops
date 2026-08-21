import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeListing,
  deriveExportReadiness,
  exportSixBitCsv,
  importSixBitCsv,
} from "./phase3";

const header =
  "SourceDatabase,ItemID,InventoryID,SKU,Title,eBay Description,QtyToList,QtyUncommitted,QtyCurrentlyListed,QtySold,StockTotal,FixedPrice,ItemStatus,Condition,R2Code,Check Count,Unknown Keep";
function csv(row: string) {
  return `${header}\r\n${row}\r\n`;
}
const clean =
  'acct,100,inv-1,SKU-1,"NEW Zebra ZT410 Industrial Thermal Label Printer 203dpi USB Ethernet w/ Cable","Verified printer. Labels/media are not included.",1,2,0,0,2,200,Ready,A,R2-OK,TRUE,"pass,through"';

test("SixBit adapter preserves exact originals, aliases, quoted fields, and unknown columns", () => {
  const parsed = importSixBitCsv(csv(clean));
  assert.equal(parsed.schemaVersion, "sixbit-listing-v1");
  assert.equal(parsed.rows[0]!.original["Unknown Keep"], "pass,through");
  assert.deepEqual(parsed.rows[0]!.unknownColumns, ["Unknown Keep"]);
  assert.equal(parsed.rows[0]!.normalized.checkCount, true);
  assert.equal(Object.isFrozen(parsed.rows[0]!.original), true);
});
test("CSV supports embedded newlines and rejects wrong width, duplicate identity, duplicate aliases, and unsafe numbers", () => {
  const multiline = csv(
    clean.replace(
      "Verified printer. Labels/media are not included.",
      "Verified\nprinter. Labels/media are not included.",
    ),
  );
  assert.match(
    importSixBitCsv(multiline).rows[0]!.normalized.description,
    /\n/,
  );
  assert.throws(() => importSixBitCsv("SKU,Title\nonly"), /fields/);
  assert.throws(
    () => importSixBitCsv(`${header}\n${clean}\n${clean}`),
    /Duplicate listing identity/,
  );
  assert.throws(
    () => importSixBitCsv("SKU,Title,Description,eBay Description\na,b,c,d"),
    /Multiple headers map/,
  );
  assert.throws(
    () => importSixBitCsv(csv(clean.replace(",1,2,0,0,2,", ",-1,2,0,0,2,"))),
    /nonnegative/,
  );
});
test("title rules use whole words, normalize approved tokens, and never invent identifiers", () => {
  const row = importSixBitCsv(
    csv(clean.replace("w/ Cable", "with Cable and Stand")),
  ).rows[0]!;
  const a = analyzeListing(row.normalized);
  assert.match(a.normalized.title, /w\/ Cable & Stand/);
  assert.ok(a.repairs.some((r) => r.field === "title"));
  assert.equal(a.normalized.sku, "SKU-1");
  const model = analyzeListing({
    ...row.normalized,
    title:
      "NEW GOODMAN GM9C960804CN Furnace Assembly Model 2026 Complete Verified Unit",
  });
  assert.equal(
    model.results.find((r) => r.ruleId === "TITLE.PROHIBITED")!.outcome,
    "PASS",
  );
});
test("Zebra disclosure is deterministic and R2 missing creates only the needed stable question", () => {
  const row = importSixBitCsv(
    csv(
      clean
        .replace(" Labels/media are not included.", "")
        .replace(",R2-OK,", ",,"),
    ),
  ).rows[0]!;
  const a = analyzeListing(row.normalized);
  assert.match(a.normalized.description, /Labels\/media are not included/);
  assert.deepEqual(
    a.questions.map((q) => q.id),
    ["q:r2.required"],
  );
});
test("quantity scenario 1, explicit override evidence, StockTotal, and LOT parsing are deterministic", () => {
  const row = importSixBitCsv(csv(clean)).rows[0]!;
  let a = analyzeListing(row.normalized);
  assert.equal(
    a.results.find((r) => r.ruleId === "QUANTITY.CHECK_COUNT")!.outcome,
    "PASS",
  );
  assert.equal(a.normalized.stockTotal, 2);
  const override = {
    ...row.normalized,
    title:
      "NEW 12 LOT Zebra Printer Assembly Verified Complete Industrial Package 2026",
    qtyToList: 3,
    qtyUncommitted: 2,
  };
  a = analyzeListing(override);
  assert.ok(
    a.questions.some((question) => question.id === "q:qty.override.verified"),
  );
  assert.equal(a.normalized.lotSize, 12);
  const verified = analyzeListing(override, {
    "q:qty.override.verified": true,
    "q:qty.override.authorizedQty": 3,
    "q:qty.override.code": "MANAGER_APPROVAL",
    "q:qty.override.reason": "Approved synthetic evidence",
    "q:qty.override.source": "manager-42",
  });
  assert.equal(
    verified.results.find((r) => r.ruleId === "QUANTITY.AVAILABLE")!.outcome,
    "PASS_EMPLOYEE_VERIFIED",
  );
  assert.equal(verified.normalized.stockTotal, 2);
});
test("model numbers do not become lot sizes", () => {
  const row = importSixBitCsv(csv(clean)).rows[0]!;
  assert.equal(
    analyzeListing({
      ...row.normalized,
      title:
        "NEW Zebra Model 12D Printer Assembly w/ Network Interface Complete Package",
    }).normalized.lotSize,
    null,
  );
});
test("round trip preserves pass-through semantics and changes only intended repaired fields", () => {
  const parsed = importSixBitCsv(csv(clean));
  const exported = exportSixBitCsv(parsed, [
    analyzeListing(parsed.rows[0]!.normalized),
  ]);
  const reparsed = importSixBitCsv(exported.content);
  assert.equal(reparsed.rows.length, 1);
  assert.equal(reparsed.rows[0]!.original["Unknown Keep"], "pass,through");
  assert.equal(
    reparsed.rows[0]!.original.StockTotal,
    parsed.rows[0]!.original.StockTotal,
  );
  assert.equal(exported.rowCount, parsed.rows.length);
});
test("export quotes multiline values and preserves raw formula-like pass-through fields", () => {
  const malicious = csv(
    clean
      .replace("SKU-1", "=1+1")
      .replace("Verified printer.", "line one\nline two"),
  );
  const parsed = importSixBitCsv(malicious);
  const output = exportSixBitCsv(parsed, [
    analyzeListing(parsed.rows[0]!.normalized),
  ]);
  assert.match(output.content, /,=1\+1,/);
  assert.match(output.content, /"line one\nline two/);
  assert.equal(output.rowCount, 1);
});

test("realistic synthetic batch remains linear enough for synchronous nonproduction processing", () => {
  const rows = Array.from({ length: 1_000 }, (_, index) =>
    clean.replace(
      "100,inv-1,SKU-1",
      `${1000 + index},inv-${index},SKU-${index}`,
    ),
  );
  const started = performance.now();
  const parsed = importSixBitCsv(`${header}\n${rows.join("\n")}\n`);
  const analyses = parsed.rows.map((row) => analyzeListing(row.normalized));
  const output = exportSixBitCsv(parsed, analyses);
  assert.equal(output.rowCount, 1_000);
  assert.ok(
    performance.now() - started < 5_000,
    "1,000-row import/analyze/export exceeded five seconds",
  );
});

test("unresolved rules have explicit resolution classes and invalid R2 has an employee question", () => {
  const row = importSixBitCsv(csv(clean)).rows[0]!;
  const analysis = analyzeListing({
    ...row.normalized,
    r2Code: "bad value",
    title: "Used short title",
  });
  const unresolved = analysis.results.filter(
    (r) =>
      r.ruleId !== "EXPORT.READY" &&
      (r.outcome === "VERIFY" || (r.outcome === "FAIL" && !r.safeRepair)),
  );
  assert.ok(unresolved.every((r) => r.resolutionClass));
  assert.ok(analysis.questions.some((q) => q.id === "q:r2.required"));
});

test("review evidence resolves reviewer rules but cannot resolve hard-invalid rules", () => {
  const row = importSixBitCsv(csv(clean)).rows[0]!;
  const short = analyzeListing({
    ...row.normalized,
    title: "NEW valid factual short title",
  });
  assert.equal(deriveExportReadiness(short.results, ["TITLE.LENGTH"]), true);
  const hard = analyzeListing({
    ...row.normalized,
    title: "Used invalid title",
    qtyToList: 9,
    qtyUncommitted: 2,
    qtyCurrentlyListed: 0,
  });
  assert.equal(
    deriveExportReadiness(
      hard.results,
      hard.results.map((r) => r.ruleId),
    ),
    false,
  );
});

test("listed quantity truth table is deterministic and ambiguous status fails closed", () => {
  const row = importSixBitCsv(csv(clean)).rows[0]!;
  const listed = {
    ...row.normalized,
    qtyCurrentlyListed: 2,
    qtyToList: 2,
    qtySold: 0,
    itemStatus: "Active",
    checkCount: false,
  };
  assert.equal(
    analyzeListing(listed).results.find(
      (r) => r.ruleId === "QUANTITY.CHECK_COUNT",
    )!.outcome,
    "PASS",
  );
  assert.equal(
    analyzeListing({ ...listed, qtyToList: 1 }).results.find(
      (r) => r.ruleId === "QUANTITY.CHECK_COUNT",
    )!.outcome,
    "VERIFY",
  );
  assert.equal(
    analyzeListing({ ...listed, itemStatus: "maybe" }).results.find(
      (r) => r.ruleId === "QUANTITY.CHECK_COUNT",
    )!.outcome,
    "FAIL",
  );
});
