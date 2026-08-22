import { createHash } from "node:crypto";

export const SIXBIT_SCHEMA_VERSION = "sixbit-listing-v1";
export const LISTING_RULESET_VERSION = "listing-rules-v2";
export type ResolutionClass =
  | "EMPLOYEE_RESOLVABLE"
  | "REVIEWER_RESOLVABLE"
  | "NON_OVERRIDABLE_HARD_INVALID";

export const SIXBIT_COLUMNS = [
  "SourceDatabase",
  "ItemID",
  "InventoryID",
  "SKU",
  "Title",
  "eBay Description",
  "StorageLocation",
  "QtyToList",
  "QtyUncommitted",
  "QtyCurrentlyListed",
  "QtySold",
  "StockTotal",
  "FixedPrice",
  "ItemStatus",
  "ItemStatusID",
  "Condition",
  "R2Code",
  "Check Count",
  "CF Check",
] as const;
export type SixBitKnownColumn = (typeof SIXBIT_COLUMNS)[number];
const aliases: Record<string, SixBitKnownColumn> = Object.fromEntries(
  SIXBIT_COLUMNS.map((name) => [
    name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    name,
  ]),
) as Record<string, SixBitKnownColumn>;
Object.assign(aliases, {
  sourceaccount: "SourceDatabase",
  description: "eBay Description",
  ebaydescription: "eBay Description",
  quantitytolist: "QtyToList",
  qtyavailable: "QtyUncommitted",
  r2: "R2Code",
  checkcount: "Check Count",
  cfcheck: "CF Check",
});

export type RuleOutcome = "PASS" | "FAIL" | "VERIFY" | "PASS_EMPLOYEE_VERIFIED";
export interface NormalizedListing {
  sourceDatabase: string;
  itemId: string;
  inventoryId: string;
  sku: string;
  title: string;
  description: string;
  storageLocation: string;
  qtyToList: number | null;
  qtyUncommitted: number | null;
  qtyCurrentlyListed: number | null;
  qtySold: number | null;
  stockTotal: number | null;
  fixedPrice: string;
  itemStatus: string;
  itemStatusId: string;
  condition: string;
  r2Code: string;
  checkCount: boolean | null;
  cfCheck: string;
  lotSize: number | null;
  totalPieces: number | null;
  priceEachPiece: number | null;
}
export interface ImportedListing {
  rowNumber: number;
  original: Readonly<Record<string, string>>;
  normalized: NormalizedListing;
  unknownColumns: readonly string[];
}
export interface CsvImport {
  schemaVersion: typeof SIXBIT_SCHEMA_VERSION;
  headers: readonly string[];
  mapping: Readonly<Record<string, SixBitKnownColumn | null>>;
  rows: readonly ImportedListing[];
  checksum: string;
}
export interface SafeRepair {
  field: keyof NormalizedListing;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
  reason: string;
  algorithmVersion: typeof LISTING_RULESET_VERSION;
}
export interface RuleResult {
  ruleId: string;
  ruleVersion: typeof LISTING_RULESET_VERSION;
  category:
    | "Title"
    | "Description"
    | "R2"
    | "Quantity"
    | "Lot Size"
    | "Verification"
    | "Export Readiness";
  outcome: RuleOutcome;
  severity: "info" | "warning" | "error";
  field: keyof NormalizedListing | null;
  currentValue: unknown;
  reason: string;
  safeRepair?: SafeRepair;
  employeeRequired: boolean;
  reviewerRequired: boolean;
  resolutionClass?: ResolutionClass;
}
export interface EmployeeQuestion {
  id: string;
  ruleId: string;
  type: "boolean" | "number" | "text" | "select";
  label: string;
  options?: readonly string[];
  required: true;
  displayOrder: number;
  shortcutPosition?: number;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}
export interface Analysis {
  ruleVersion: typeof LISTING_RULESET_VERSION;
  normalized: NormalizedListing;
  repairs: readonly SafeRepair[];
  results: readonly RuleResult[];
  questions: readonly EmployeeQuestion[];
  exportReady: boolean;
}

function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes("\0")) throw new Error("CSV contains a NUL byte.");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      if (field) throw new Error("Malformed CSV quote.");
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("Unterminated CSV quote.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ""));
}
function numeric(value: string, field: string): number | null {
  if (!value.trim()) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(value.trim()))
    throw new Error(`${field} must be numeric.`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error(`${field} must be a nonnegative safe integer.`);
  return n;
}
function bool(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (["true", "yes", "1"].includes(v)) return true;
  if (["false", "no", "0"].includes(v)) return false;
  throw new Error("Check Count must be TRUE or FALSE.");
}
function known(
  row: Record<string, string>,
  mapping: Record<string, SixBitKnownColumn | null>,
  name: SixBitKnownColumn,
) {
  const header = Object.keys(mapping).find((h) => mapping[h] === name);
  return header ? (row[header] ?? "") : "";
}
function lotEvidence(title: string) {
  const explicitIntent =
    /(?:^|\s)(?:[-+]?\d+\s+LOT|LOT\b|KIT\b|[-+]?\d+x\s+KIT)(?:\s|$)/i.test(
      title,
    );
  const matches = [
    ...title.matchAll(
      /(?:^|\s)(?:([-+]?\d+)\s+LOT|KIT\s+([-+]?\d+)x|([-+]?\d+)x\s+KIT)(?=\s|$)/gi,
    ),
  ];
  const values = matches.map((match) =>
    Number(match[1] ?? match[2] ?? match[3]),
  );
  const invalid =
    explicitIntent &&
    (values.length !== 1 ||
      !Number.isSafeInteger(values[0]) ||
      values[0]! < 1 ||
      values[0]! > 1_000);
  return { size: invalid || values.length !== 1 ? null : values[0]!, invalid };
}
function lot(title: string) {
  return lotEvidence(title).size;
}
function hasInvalidExplicitLot(title: string) {
  return lotEvidence(title).invalid;
}

export function importSixBitCsv(
  content: string,
  limits = { maxBytes: 2_000_000, maxRows: 1_000 },
): CsvImport {
  if (Buffer.byteLength(content, "utf8") > limits.maxBytes)
    throw new Error("CSV exceeds the byte limit.");
  const matrix = parseCsv(content);
  if (matrix.length < 2)
    throw new Error("CSV requires a header and at least one row.");
  if (matrix.length - 1 > limits.maxRows)
    throw new Error("CSV exceeds the row limit.");
  const rawHeaders = matrix[0]!;
  if (rawHeaders.some((h) => h !== h.trim()))
    throw new Error(
      "CSV headers cannot contain leading or trailing whitespace.",
    );
  const headers = rawHeaders.slice();
  if (headers.some((h) => !h)) throw new Error("CSV headers cannot be blank.");
  if (new Set(headers.map((h) => h.toLowerCase())).size !== headers.length)
    throw new Error("CSV headers must be unique.");
  const mapping: Record<string, SixBitKnownColumn | null> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const target = aliases[h.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? null;
    if (target && used.has(target))
      throw new Error(`Multiple headers map to ${target}.`);
    mapping[h] = target;
    if (target) used.add(target);
  }
  for (const required of ["SKU", "Title"] as const)
    if (!used.has(required))
      throw new Error(`Required SixBit header is missing: ${required}.`);
  const rows = matrix.slice(1).map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(
        `Row ${index + 2} has ${values.length} fields; expected ${headers.length}.`,
      );
    const original = Object.freeze(
      Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])),
    );
    const get = (n: SixBitKnownColumn) => known(original, mapping, n);
    const lotSize = lot(get("Title"));
    const fixed = get("FixedPrice");
    const price = Number(fixed);
    const normalized: NormalizedListing = {
      sourceDatabase: get("SourceDatabase"),
      itemId: get("ItemID"),
      inventoryId: get("InventoryID"),
      sku: get("SKU"),
      title: get("Title"),
      description: get("eBay Description"),
      storageLocation: get("StorageLocation"),
      qtyToList: numeric(get("QtyToList"), "QtyToList"),
      qtyUncommitted: numeric(get("QtyUncommitted"), "QtyUncommitted"),
      qtyCurrentlyListed: numeric(
        get("QtyCurrentlyListed"),
        "QtyCurrentlyListed",
      ),
      qtySold: numeric(get("QtySold"), "QtySold"),
      stockTotal: numeric(get("StockTotal"), "StockTotal"),
      fixedPrice: fixed,
      itemStatus: get("ItemStatus"),
      itemStatusId: get("ItemStatusID"),
      condition: get("Condition"),
      r2Code: get("R2Code"),
      checkCount: bool(get("Check Count")),
      cfCheck: get("CF Check"),
      lotSize,
      totalPieces: lotSize,
      priceEachPiece:
        lotSize && Number.isFinite(price)
          ? Math.round((price / lotSize) * 100) / 100
          : null,
    };
    return {
      rowNumber: index + 2,
      original,
      normalized,
      unknownColumns: Object.freeze(headers.filter((h) => mapping[h] === null)),
    };
  });
  const ids = new Set<string>();
  for (const row of rows) {
    const id = `${row.normalized.sourceDatabase}\0${row.normalized.itemId}\0${row.normalized.inventoryId}\0${row.normalized.sku}`;
    if (ids.has(id))
      throw new Error(`Duplicate listing identity at row ${row.rowNumber}.`);
    ids.add(id);
  }
  return {
    schemaVersion: SIXBIT_SCHEMA_VERSION,
    headers: Object.freeze(headers),
    mapping: Object.freeze(mapping),
    rows: Object.freeze(rows),
    checksum: createHash("sha256").update(content).digest("hex"),
  };
}

const banned =
  /\b(?:used|refurbished|open box|good|nice|NOB|no|not|w\/o|missing)\b/i;
function result(
  ruleId: string,
  category: RuleResult["category"],
  outcome: RuleOutcome,
  field: keyof NormalizedListing | null,
  currentValue: unknown,
  reason: string,
  extra: Partial<RuleResult> = {},
): RuleResult {
  return {
    ruleId,
    ruleVersion: LISTING_RULESET_VERSION,
    category,
    outcome,
    severity:
      outcome === "PASS" || outcome === "PASS_EMPLOYEE_VERIFIED"
        ? "info"
        : outcome === "VERIFY"
          ? "warning"
          : "error",
    field,
    currentValue,
    reason,
    employeeRequired: false,
    reviewerRequired: outcome === "VERIFY",
    ...extra,
  };
}
export function deriveExportReadiness(
  results: readonly RuleResult[],
  reviewerResolvedRuleIds: readonly string[] = [],
) {
  const resolved = new Set(reviewerResolvedRuleIds);
  return results.every((r) => {
    if (
      r.ruleId === "EXPORT.READY" ||
      r.outcome === "PASS" ||
      r.outcome === "PASS_EMPLOYEE_VERIFIED" ||
      r.safeRepair
    )
      return true;
    return (
      r.outcome === "VERIFY" &&
      r.resolutionClass === "REVIEWER_RESOLVABLE" &&
      resolved.has(r.ruleId)
    );
  });
}
export function analyzeListing(
  input: NormalizedListing,
  answers: Readonly<Record<string, unknown>> = {},
): Analysis {
  const n = { ...input };
  n.lotSize = lot(n.title);
  n.totalPieces = n.lotSize;
  const price = Number(n.fixedPrice);
  n.priceEachPiece =
    n.lotSize && Number.isFinite(price)
      ? Math.round((price / n.lotSize) * 100) / 100
      : null;
  const repairs: SafeRepair[] = [];
  const results: RuleResult[] = [];
  const questions: EmployeeQuestion[] = [];
  const addRepair = (
    field: keyof NormalizedListing,
    after: unknown,
    reason: string,
  ): SafeRepair => {
    const repair: SafeRepair = {
      field,
      before: n[field],
      after: after as never,
      reason,
      algorithmVersion: LISTING_RULESET_VERSION,
    };
    repairs.push(repair);
    (n as unknown as Record<string, unknown>)[field] = after;
    return repair;
  };
  let title = n.title.trim().replace(/\s+/g, " ");
  title = title
    .replace(/\bwith\b/gi, "w/")
    .replace(/\band\b/gi, "&")
    .replace(/\/w\b/gi, "w/");
  if (title !== n.title) {
    const repair = addRepair(
      "title",
      title,
      "Normalize spacing and approved abbreviations without changing identity tokens.",
    );
    results.push(
      result(
        "TITLE.NORMALIZE",
        "Title",
        "FAIL",
        "title",
        input.title,
        "Safe deterministic title normalization is available.",
        { safeRepair: repair },
      ),
    );
  } else
    results.push(
      result(
        "TITLE.NORMALIZE",
        "Title",
        "PASS",
        "title",
        title,
        "No safe normalization is required.",
      ),
    );
  if (banned.test(n.title))
    results.push(
      result(
        "TITLE.PROHIBITED",
        "Title",
        "VERIFY",
        "title",
        n.title,
        "Title contains prohibited condition, filler, or negative wording.",
        { resolutionClass: "NON_OVERRIDABLE_HARD_INVALID" },
      ),
    );
  else
    results.push(
      result(
        "TITLE.PROHIBITED",
        "Title",
        "PASS",
        "title",
        n.title,
        "Title contains no prohibited whole-word pattern.",
      ),
    );
  results.push(
    result(
      "TITLE.LENGTH",
      "Title",
      n.title.length >= 74 && n.title.length <= 80 ? "PASS" : "VERIFY",
      "title",
      n.title.length,
      "Target title length is 74–80 characters where factual content permits.",
      n.title.length >= 74 && n.title.length <= 80
        ? {}
        : { resolutionClass: "REVIEWER_RESOLVABLE", reviewerRequired: true },
    ),
  );
  const zebra = /\bzebra\b/i.test(`${n.title} ${n.description}`);
  if (zebra && !/labels?|media\s+(?:is\s+)?not included/i.test(n.description)) {
    const suffix = " Labels/media are not included.";
    const repair = addRepair(
      "description",
      `${n.description.trim()}${n.description.trim() ? " " : ""}${suffix.trim()}`,
      "Add the required deterministic Zebra media disclosure.",
    );
    results.push(
      result(
        "DESCRIPTION.ZEBRA_MEDIA",
        "Description",
        "FAIL",
        "description",
        input.description,
        "Zebra listing requires a labels/media-not-included disclosure.",
        { safeRepair: repair },
      ),
    );
  } else
    results.push(
      result(
        "DESCRIPTION.ZEBRA_MEDIA",
        "Description",
        "PASS",
        "description",
        n.description,
        "Required deterministic disclosure is present or not applicable.",
      ),
    );
  const verifiedR2 = answers["q:r2.required"];
  if (!n.r2Code.trim() && typeof verifiedR2 === "string" && verifiedR2.trim())
    n.r2Code = verifiedR2.trim();
  if (!n.r2Code.trim()) {
    results.push(
      result(
        "R2.REQUIRED",
        "R2",
        "VERIFY",
        "r2Code",
        n.r2Code,
        "R2/custom code is missing and must not be guessed.",
        {
          employeeRequired: true,
          reviewerRequired: false,
          resolutionClass: "EMPLOYEE_RESOLVABLE",
        },
      ),
    );
    questions.push({
      id: "q:r2.required",
      ruleId: "R2.REQUIRED",
      type: "text",
      label:
        "Enter the verified R2/custom code, or NONE when the approved semantics apply.",
      required: true,
      displayOrder: 10,
      minLength: 1,
      maxLength: 32,
    });
  } else if (!/^[A-Z0-9][A-Z0-9-]{0,31}$/i.test(n.r2Code)) {
    results.push(
      result(
        "R2.REQUIRED",
        "R2",
        "VERIFY",
        "r2Code",
        n.r2Code,
        "R2/custom code format is invalid.",
        {
          employeeRequired: true,
          reviewerRequired: false,
          resolutionClass: "EMPLOYEE_RESOLVABLE",
        },
      ),
    );
    questions.push({
      id: "q:r2.required",
      ruleId: "R2.REQUIRED",
      type: "text",
      label: "Replace the invalid value with the verified R2/custom code.",
      required: true,
      displayOrder: 10,
      minLength: 1,
      maxLength: 32,
    });
  } else
    results.push(
      result(
        "R2.REQUIRED",
        "R2",
        typeof verifiedR2 === "string" ? "PASS_EMPLOYEE_VERIFIED" : "PASS",
        "r2Code",
        n.r2Code,
        "R2/custom code is present and structurally valid.",
      ),
    );
  const missingQuantityFields = (
    ["qtyToList", "qtyUncommitted", "qtyCurrentlyListed"] as const
  ).filter((field) => n[field] === null);
  results.push(
    result(
      "QUANTITY.REQUIRED",
      "Quantity",
      missingQuantityFields.length ? "FAIL" : "PASS",
      missingQuantityFields[0] ?? "qtyToList",
      missingQuantityFields.length ? null : n.qtyToList,
      missingQuantityFields.length
        ? `Required quantity values are missing: ${missingQuantityFields.join(", ")}.`
        : "QtyToList, QtyUncommitted, and QtyCurrentlyListed are present nonnegative safe integers.",
      missingQuantityFields.length
        ? { resolutionClass: "NON_OVERRIDABLE_HARD_INVALID" }
        : {},
    ),
  );
  if (
    n.qtyToList !== null &&
    n.qtyUncommitted !== null &&
    n.qtyToList > n.qtyUncommitted
  ) {
    const verified = answers["q:qty.override.verified"] === true;
    const authorizedQty = answers["q:qty.override.authorizedQty"];
    const code = answers["q:qty.override.code"];
    const reason = answers["q:qty.override.reason"];
    const source = answers["q:qty.override.source"];
    const evidenceValid =
      verified &&
      authorizedQty === n.qtyToList &&
      ["MANAGER_APPROVAL", "SYSTEM_RECONCILIATION", "PHYSICAL_COUNT"].includes(
        String(code),
      ) &&
      typeof reason === "string" &&
      reason.trim().length >= 8 &&
      reason.length <= 500 &&
      typeof source === "string" &&
      source.trim().length >= 3 &&
      source.length <= 200;
    results.push(
      result(
        "QUANTITY.AVAILABLE",
        "Quantity",
        evidenceValid ? "PASS_EMPLOYEE_VERIFIED" : "VERIFY",
        "qtyToList",
        n.qtyToList,
        evidenceValid
          ? "Employee supplied complete, matching authorization evidence."
          : "QtyToList exceeds QtyUncommitted and requires structured authorization evidence.",
        {
          employeeRequired: !evidenceValid,
          reviewerRequired: false,
          resolutionClass: "EMPLOYEE_RESOLVABLE",
        },
      ),
    );
    if (!evidenceValid) {
      questions.push(
        {
          id: "q:qty.override.verified",
          ruleId: "QUANTITY.AVAILABLE",
          type: "boolean",
          label: "Is this QtyToList override authorized and verified?",
          required: true,
          displayOrder: 20,
          shortcutPosition: 1,
        },
        {
          id: "q:qty.override.authorizedQty",
          ruleId: "QUANTITY.AVAILABLE",
          type: "number",
          label: "Enter the specifically authorized QtyToList.",
          required: true,
          displayOrder: 21,
          min: 0,
          max: 1_000_000,
        },
        {
          id: "q:qty.override.code",
          ruleId: "QUANTITY.AVAILABLE",
          type: "select",
          label: "Select the authorization evidence type.",
          options: [
            "MANAGER_APPROVAL",
            "SYSTEM_RECONCILIATION",
            "PHYSICAL_COUNT",
          ],
          required: true,
          displayOrder: 22,
        },
        {
          id: "q:qty.override.reason",
          ruleId: "QUANTITY.AVAILABLE",
          type: "text",
          label: "Enter the authorization reason (8–500 characters).",
          required: true,
          displayOrder: 23,
          minLength: 8,
          maxLength: 500,
        },
        {
          id: "q:qty.override.source",
          ruleId: "QUANTITY.AVAILABLE",
          type: "text",
          label: "Enter the evidence source or reference.",
          required: true,
          displayOrder: 24,
          minLength: 3,
          maxLength: 200,
        },
      );
    }
  } else
    results.push(
      result(
        "QUANTITY.AVAILABLE",
        "Quantity",
        "PASS",
        "qtyToList",
        n.qtyToList,
        "QtyToList does not exceed QtyUncommitted.",
      ),
    );
  if (
    (n.qtyCurrentlyListed ?? 0) === 0 &&
    n.qtyUncommitted !== null &&
    n.qtyToList !== null
  ) {
    const diff = n.qtyUncommitted - n.qtyToList;
    const expected = diff === 1 ? true : diff === 0 ? false : null;
    if (typeof answers["q:check-count"] === "boolean")
      n.checkCount = answers["q:check-count"];
    const checkCountNeedsEvidence =
      expected === null || n.checkCount !== expected;
    results.push(
      result(
        "QUANTITY.CHECK_COUNT",
        "Quantity",
        expected === null
          ? "FAIL"
          : checkCountNeedsEvidence
            ? "VERIFY"
            : "PASS",
        "checkCount",
        n.checkCount,
        expected === null
          ? "Scenario 1 difference must be 0 or 1."
          : `Check Count must be ${String(expected).toUpperCase()} when the difference is ${diff}.`,
        expected === null
          ? { resolutionClass: "NON_OVERRIDABLE_HARD_INVALID" }
          : checkCountNeedsEvidence
            ? {
                employeeRequired: true,
                reviewerRequired: false,
                resolutionClass: "EMPLOYEE_RESOLVABLE",
              }
            : {},
      ),
    );
    if (checkCountNeedsEvidence && expected !== null)
      questions.push({
        id: "q:check-count",
        ruleId: "QUANTITY.CHECK_COUNT",
        type: "boolean",
        label:
          "Verify the Check Count value for the displayed quantity evidence.",
        required: true,
        displayOrder: 30,
        shortcutPosition: 2,
      });
  } else if (
    (n.qtyCurrentlyListed ?? 0) > 0 &&
    n.qtyToList !== null &&
    n.qtyUncommitted !== null
  ) {
    const status = n.itemStatus.trim().toLowerCase();
    const validStatus = /^(active|listed|ended|inactive|out of stock)$/.test(
      status,
    );
    const expected =
      n.qtyToList !== n.qtyCurrentlyListed || (n.qtySold ?? 0) > 0;
    if (typeof answers["q:check-count"] === "boolean")
      n.checkCount = answers["q:check-count"];
    const needs = validStatus && n.checkCount !== expected;
    results.push(
      result(
        "QUANTITY.CHECK_COUNT",
        "Quantity",
        !validStatus ? "FAIL" : needs ? "VERIFY" : "PASS",
        "checkCount",
        n.checkCount,
        !validStatus
          ? "Listed inventory has an unsupported or ambiguous ItemStatus."
          : `For listed inventory, Check Count must be ${String(expected).toUpperCase()} from listed/sold quantity evidence.`,
        !validStatus
          ? { resolutionClass: "NON_OVERRIDABLE_HARD_INVALID" }
          : needs
            ? {
                employeeRequired: true,
                reviewerRequired: false,
                resolutionClass: "EMPLOYEE_RESOLVABLE",
              }
            : {},
      ),
    );
    if (needs)
      questions.push({
        id: "q:check-count",
        ruleId: "QUANTITY.CHECK_COUNT",
        type: "boolean",
        label:
          "Verify Check Count for the displayed listed-inventory evidence.",
        required: true,
        displayOrder: 30,
        shortcutPosition: 2,
      });
  } else
    results.push(
      result(
        "QUANTITY.CHECK_COUNT",
        "Quantity",
        "PASS",
        "checkCount",
        n.checkCount,
        "Scenario 1 validation is not applicable.",
      ),
    );
  results.push(
    result(
      "QUANTITY.STOCK_TOTAL",
      "Quantity",
      "PASS",
      "stockTotal",
      n.stockTotal,
      "StockTotal is preserved and is never changed to satisfy another rule.",
    ),
  );
  results.push(
    result(
      "LOT.PARSE",
      "Lot Size",
      hasInvalidExplicitLot(n.title) ? "FAIL" : "PASS",
      "lotSize",
      n.lotSize,
      hasInvalidExplicitLot(n.title)
        ? "An explicit LOT/KIT token must be a whole number from 1 through 1000."
        : n.lotSize
          ? `Parsed an explicit ${n.lotSize}-piece LOT/KIT token.`
          : "No explicit LOT/KIT token was detected; model-like numbers were ignored.",
      hasInvalidExplicitLot(n.title)
        ? { resolutionClass: "NON_OVERRIDABLE_HARD_INVALID" }
        : {},
    ),
  );
  const unresolved = !deriveExportReadiness(results);
  results.push(
    result(
      "EXPORT.READY",
      "Export Readiness",
      unresolved ? "VERIFY" : "PASS",
      null,
      null,
      unresolved
        ? "Unresolved verification remains; preserve the row for employee/reviewer resolution."
        : "All deterministic export gates pass.",
    ),
  );
  return {
    ruleVersion: LISTING_RULESET_VERSION,
    normalized: n,
    repairs,
    results,
    questions,
    exportReady: !unresolved,
  };
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
export function exportSixBitCsv(
  imported: CsvImport,
  analyses: readonly Analysis[],
) {
  if (analyses.length !== imported.rows.length)
    throw new Error("Export row count must match import row count.");
  const lines = [imported.headers.map(csvCell).join(",")];
  for (let i = 0; i < imported.rows.length; i++) {
    const row = imported.rows[i]!;
    const a = analyses[i]!;
    const values = { ...row.original };
    for (const [header, target] of Object.entries(imported.mapping)) {
      if (
        !target ||
        !(
          ["Title", "eBay Description", "R2Code", "Check Count"] as string[]
        ).includes(target)
      )
        continue;
      const key: Record<SixBitKnownColumn, keyof NormalizedListing> = {
        SourceDatabase: "sourceDatabase",
        ItemID: "itemId",
        InventoryID: "inventoryId",
        SKU: "sku",
        Title: "title",
        "eBay Description": "description",
        StorageLocation: "storageLocation",
        QtyToList: "qtyToList",
        QtyUncommitted: "qtyUncommitted",
        QtyCurrentlyListed: "qtyCurrentlyListed",
        QtySold: "qtySold",
        StockTotal: "stockTotal",
        FixedPrice: "fixedPrice",
        ItemStatus: "itemStatus",
        ItemStatusID: "itemStatusId",
        Condition: "condition",
        R2Code: "r2Code",
        "Check Count": "checkCount",
        "CF Check": "cfCheck",
      };
      const v = a.normalized[key[target]];
      values[header] =
        v === null
          ? ""
          : typeof v === "boolean"
            ? v
              ? "TRUE"
              : "FALSE"
            : String(v);
    }
    lines.push(imported.headers.map((h) => csvCell(values[h] ?? "")).join(","));
  }
  const content = `${lines.join("\r\n")}\r\n`;
  return {
    schemaVersion: imported.schemaVersion,
    ruleVersion: LISTING_RULESET_VERSION,
    content,
    checksum: createHash("sha256").update(content).digest("hex"),
    rowCount: imported.rows.length,
  };
}
