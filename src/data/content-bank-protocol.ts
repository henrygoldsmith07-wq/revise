import type { Question } from "@/domain/types";

/** The one message src/worker/content-bank.worker.ts posts back. */
export type ContentBankWorkerMessage =
  | { type: "bank"; questions: Question[] }
  | { type: "error"; message: string };

export function isBankMessage(data: unknown): data is { type: "bank"; questions: Question[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "bank" &&
    Array.isArray((data as { questions?: unknown }).questions)
  );
}
