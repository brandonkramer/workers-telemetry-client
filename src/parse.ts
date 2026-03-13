import type { TelemetryEvent, WorkerLogEntry } from "./types";

// ═══════════════════════════════════════════════════════════════
// ────────── Event Parsing ─────────────────────────────────────

/**
 * parseEvent
 *
 * Flattens a nested TelemetryEvent into a flat WorkerLogEntry.
 * Prefers $workers fields (url, method, status, wallTime, rayId) when present.
 * Falls back to $metadata values when $workers is absent.
 * Uses scriptName as service when $metadata.service is missing.
 * Defaults service to "unknown", level to "info", and message to trigger or empty string.
 */
export function parseEvent(event: TelemetryEvent): WorkerLogEntry {
  return {
    requestId: event.$metadata.id,
    timestamp: event.timestamp,
    level: event.$metadata.level ?? "info",
    message: event.$metadata.message ?? event.$metadata.trigger ?? "",
    service: event.$metadata.service ?? event.$workers?.scriptName ?? "unknown",
    requestUrl: event.$workers?.event.request?.url ?? event.$metadata.url,
    method: event.$workers?.event.request?.method,
    statusCode: event.$workers?.event.response?.status ?? event.$metadata.statusCode,
    duration: event.$workers?.wallTimeMs ?? event.$metadata.duration,
    rayId: event.$workers?.event.rayId,
    outcome: event.$workers?.outcome,
    eventType: event.$metadata.type ?? event.$workers?.eventType,
    source: event.source,
  };
}

/**
 * parseEvents
 *
 * Maps an array of TelemetryEvents to WorkerLogEntry via parseEvent.
 * Returns an empty array for empty input.
 */
export function parseEvents(events: TelemetryEvent[]): WorkerLogEntry[] {
  return events.map(parseEvent);
}

/**
 * dedup
 *
 * Removes duplicate WorkerLogEntry records by requestId, keeping the first occurrence.
 * Returns an empty array for empty input.
 */
export function dedup(logs: WorkerLogEntry[]): WorkerLogEntry[] {
  const seen = new Set<string>();
  return logs.filter((log) => {
    if (seen.has(log.requestId)) return false;
    seen.add(log.requestId);
    return true;
  });
}
