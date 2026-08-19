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

export interface AiProcessingRequest<TInput, TOutput> {
  promptId: string;
  promptVersion: string;
  input: TInput;
  timeoutMs: number;
  model: string;
  retry: { maxAttempts: number; baseDelayMs: number; retryableErrorCodes: readonly string[] };
  validateOutput(value: unknown): TOutput;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number;
  latencyMs: number;
}

export interface AiProcessingResult<TOutput> {
  ok: true;
  output: TOutput;
  model: string;
  usage: AiUsage;
}

export interface AiProcessingFailure {
  ok: false;
  code: "timeout" | "rate_limited" | "malformed_output" | "provider_error" | "retry_exhausted";
  safeMessage: string;
  retryable: boolean;
  model: string;
  latencyMs: number;
}

export interface ListingAiProcessor<TInput, TOutput> {
  process(request: AiProcessingRequest<TInput, TOutput>): Promise<AiProcessingResult<TOutput> | AiProcessingFailure>;
}
