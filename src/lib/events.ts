import { EventEmitter } from "node:events";
import type { Transaction, Analytics, DriftInsight } from "@/src/lib/types";

export type TransactionEvent = {
  type: "transaction";
  transaction: Transaction;
  analytics: Analytics;
  insight: DriftInsight | null;
};

const g = globalThis as unknown as { __bus?: EventEmitter; __insights?: string[] };
const bus = g.__bus ?? (g.__bus = new EventEmitter());
bus.setMaxListeners(0);
if (!g.__insights) g.__insights = [];
const recentInsights = g.__insights;

export function publishTransaction(event: TransactionEvent): void {
  if (event.insight) {
    recentInsights.unshift(event.insight.message);
    if (recentInsights.length > 10) recentInsights.pop();
  }
  bus.emit("event", event);
}

export function getRecentInsights(): string[] {
  return [...recentInsights];
}

export function subscribe(handler: (event: TransactionEvent) => void): () => void {
  bus.on("event", handler);
  return () => bus.off("event", handler);
}
