// GET /api/stream
// Server-Sent Events (SSE) endpoint. Keeps a long-lived connection open and pushes
// real-time transaction events (including drift insights) to the client as they happen.
// Each event is a JSON-serialized TransactionEvent sent as "data: {...}\n\n".
// The connection is cleaned up automatically when the client disconnects.
import { subscribe } from "@/src/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let unsub = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      send({ type: "connected" });
      unsub = subscribe(send);
    },
    cancel() { unsub(); },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
