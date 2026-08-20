import type { ProcessingStatus } from "./model";

export const LEGAL_STATUS_TRANSITIONS: Readonly<Record<ProcessingStatus, readonly ProcessingStatus[]>> = {
  pending: ["ready_for_employee", "awaiting_processing", "processing_failed"],
  ready_for_employee: ["in_progress", "completed", "needs_review"],
  in_progress: ["completed", "needs_review", "ready_for_employee"],
  completed: ["awaiting_processing", "needs_review"],
  needs_review: ["reviewed", "ready_for_employee"],
  awaiting_processing: ["ready_for_employee", "processing_failed", "reviewed"],
  processing_failed: ["awaiting_processing", "needs_review"],
  reviewed: ["awaiting_processing", "exported"],
  exported: [],
};

export function canTransition(from: ProcessingStatus, to: ProcessingStatus): boolean {
  return LEGAL_STATUS_TRANSITIONS[from].includes(to);
}

export function isProcessed(status: ProcessingStatus): boolean {
  return status === "completed" || status === "needs_review" || status === "reviewed" || status === "exported";
}

export function calculateBatchProgress(statuses: readonly ProcessingStatus[]) {
  const completedCount = statuses.filter((status) => status === "completed" || status === "reviewed" || status === "exported").length;
  const reviewCount = statuses.filter((status) => status === "needs_review").length;
  const processedCount = statuses.filter(isProcessed).length;
  const pendingCount = statuses.length - processedCount;
  return {
    totalItemCount: statuses.length,
    completedCount,
    reviewCount,
    processedCount,
    pendingCount,
    percent: statuses.length === 0 ? 0 : Math.round((processedCount / statuses.length) * 100),
    complete: statuses.length > 0 && pendingCount === 0,
  };
}
