import type { ListingItem } from "./model";

export interface CsvSourceFile {
  filename: string;
  contentType: "text/csv";
  sizeBytes: number;
  checksum: string;
}

export interface ImportedSourceRow {
  fileChecksum: string;
  rowNumber: number;
  originalColumns: Readonly<Record<string, string>>;
}

export interface CsvListingAdapter {
  validateSource(file: CsvSourceFile): Promise<void>;
  normalizeRow(row: ImportedSourceRow): Promise<ListingItem>;
  projectExport(item: ListingItem, original: ImportedSourceRow): Promise<Readonly<Record<string, string>>>;
}

export interface AiProcessingRequest<TInput> {
  promptId: string;
  promptVersion: string;
  input: TInput;
  timeoutMs: number;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number;
  latencyMs: number;
}

export interface AiProcessingResult<TOutput> {
  output: TOutput;
  model: string;
  usage: AiUsage;
}

export interface ListingAiProcessor<TInput, TOutput> {
  process(request: AiProcessingRequest<TInput>): Promise<AiProcessingResult<TOutput>>;
}
