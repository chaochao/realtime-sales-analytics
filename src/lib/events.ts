import { EventEmitter } from "node:events";
import type { Transaction, Analytics, DriftInsight } from "@/src/lib/types";

export type TransactionEvent = {
  type: "transaction";
  transaction: Transaction;
  analytics: Analytics;
  insight: DriftInsight | null;
};

const g = globalThis as unknown as { __bus?: EventEmitter };
const bus = g.__bus ?? (g.__bus = new EventEmitter());
bus.setMaxListeners(0);

export function publishTransaction(event: TransactionEvent): void {
  bus.emit("event", event);
}

export function subscribe(handler: (event: TransactionEvent) => void): () => void {
  bus.on("event", handler);
  return () => bus.off("event", handler);
}
