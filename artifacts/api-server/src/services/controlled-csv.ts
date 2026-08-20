import { createHash } from "node:crypto";
import { ApiFault } from "../lib/errors";

export const CONTROLLED_SCHEMA_VERSION = "vtk-controlled-test-v1";
export const CONTROLLED_HEADERS = ["schema_version", "scenario", "sku", "manufacturer", "model", "mpn", "title", "short_description", "included_questions", "condition_required", "conditional_fields", "warning"] as const;
export const MAX_IMPORT_BYTES = 256 * 1024;
export const MAX_IMPORT_ROWS = 1_000;

function parseLine(line: string): string[] {
  const values: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { values.push(value); value = ""; }
    else value += character;
  }
  if (quoted) throw new ApiFault(422, "INVALID_CSV", "CSV contains an unterminated quoted field.");
  values.push(value); return values;
}

function parseJsonArray(value: string, field: string): unknown[] {
  if (!value.trim()) return [];
  try { const parsed = JSON.parse(value); if (!Array.isArray(parsed)) throw new Error(); return parsed; }
  catch { throw new ApiFault(422, "INVALID_CSV", `${field} must contain a JSON array.`); }
}

export interface ControlledRow { rowNumber: number; original: Record<string, string>; normalized: Record<string, unknown>; questions: Record<string, unknown>; }

export function parseControlledCsv(input: { filename: string; mimeType: string; content: string }) {
  const bytes = Buffer.from(input.content, "utf8");
  if (!input.filename.toLowerCase().endsWith(".csv")) throw new ApiFault(415, "INVALID_FILE_TYPE", "Only .csv files are accepted.");
  if (!/^(text\/csv|application\/csv|text\/plain)$/i.test(input.mimeType)) throw new ApiFault(415, "INVALID_FILE_TYPE", "The supplied content type is not an allowed CSV type.");
  if (bytes.length === 0 || bytes.length > MAX_IMPORT_BYTES) throw new ApiFault(413, "UPLOAD_TOO_LARGE", `CSV must be between 1 and ${MAX_IMPORT_BYTES} bytes.`);
  if (bytes.includes(0)) throw new ApiFault(422, "INVALID_ENCODING", "CSV must be UTF-8 text without null bytes.");
  const normalizedText = input.content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 2) throw new ApiFault(422, "INVALID_CSV", "CSV must contain a header and at least one data row.");
  if (lines.length - 1 > MAX_IMPORT_ROWS) throw new ApiFault(422, "ROW_LIMIT_EXCEEDED", `CSV cannot exceed ${MAX_IMPORT_ROWS} data rows.`);
  const headers = parseLine(lines[0]).map((value) => value.trim());
  if (headers.join("|") !== CONTROLLED_HEADERS.join("|")) throw new ApiFault(422, "UNEXPECTED_HEADERS", `Expected headers: ${CONTROLLED_HEADERS.join(",")}`);
  const rows: ControlledRow[] = lines.slice(1).map((line, index) => {
    const values = parseLine(line); if (values.length !== headers.length) throw new ApiFault(422, "INVALID_CSV", `Row ${index + 2} has the wrong number of columns.`);
    const original = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    if (original.schema_version !== CONTROLLED_SCHEMA_VERSION) throw new ApiFault(422, "UNSUPPORTED_SCHEMA_VERSION", `Row ${index + 2} does not use ${CONTROLLED_SCHEMA_VERSION}.`);
    for (const key of ["scenario", "sku", "manufacturer", "model", "title"]) if (!original[key]?.trim()) throw new ApiFault(422, "INVALID_CSV", `Row ${index + 2} is missing ${key}.`);
    const includedQuestions = parseJsonArray(original.included_questions, "included_questions");
    const conditionalFields = parseJsonArray(original.conditional_fields, "conditional_fields");
    return { rowNumber: index + 2, original, normalized: { manufacturer: original.manufacturer.trim(), model: original.model.trim(), mpn: original.mpn.trim() || undefined, title: original.title.trim(), shortDescription: original.short_description.trim() || undefined, scenario: original.scenario.trim() }, questions: { includedQuestions, conditionRequired: original.condition_required.toLowerCase() === "true", conditionalFields } };
  });
  return { rows, checksum: createHash("sha256").update(bytes).digest("hex"), bytes };
}

export function safeFilename(filename: string) {
  const leaf = filename.replace(/\\/g, "/").split("/").pop() ?? "upload.csv";
  const safe = leaf.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return safe.toLowerCase().endsWith(".csv") ? safe : `${safe}.csv`;
}

// Apply only when values are exported to spreadsheet-oriented CSV. Original import values remain immutable.
export function escapeCsvOutputValue(value:string){return /^[\t\r\n ]*[=+\-@]/.test(value)?`'${value}`:value;}
