import { describe, it, expect } from "vitest";
import { parseEvent, parseEvents, dedup } from "../parse";
import type { TelemetryEvent } from "../types";

function makeEvent(overrides: Partial<TelemetryEvent> & { $metadata: TelemetryEvent["$metadata"] }): TelemetryEvent {
  return {
    timestamp: 1710000000000,
    $metadata: overrides.$metadata,
    $workers: overrides.$workers,
    source: overrides.source,
  };
}

const fullEvent: TelemetryEvent = {
  timestamp: 1710000000000,
  source: { tag: "test" },
  $workers: {
    scriptName: "my-worker",
    outcome: "ok",
    eventType: "fetch",
    cpuTimeMs: 5,
    wallTimeMs: 120,
    event: {
      request: { url: "https://example.com/api", method: "GET", path: "/api" },
      response: { status: 200 },
      rayId: "abc123",
    },
  },
  $metadata: {
    id: "req-1",
    service: "my-service",
    level: "error",
    message: "something broke",
    duration: 100,
    statusCode: 500,
    url: "https://fallback.com",
    type: "log",
    trigger: "scheduled",
  },
};

describe("parseEvent", () => {
  it("flattens a full TelemetryEvent into a WorkerLogEntry", () => {
    const log = parseEvent(fullEvent);

    expect(log.requestId).toBe("req-1");
    expect(log.timestamp).toBe(1710000000000);
    expect(log.level).toBe("error");
    expect(log.message).toBe("something broke");
    expect(log.service).toBe("my-service");
    expect(log.source).toEqual({ tag: "test" });
  });

  it("prefers $workers fields when present", () => {
    const log = parseEvent(fullEvent);

    expect(log.requestUrl).toBe("https://example.com/api");
    expect(log.method).toBe("GET");
    expect(log.statusCode).toBe(200);
    expect(log.duration).toBe(120);
    expect(log.rayId).toBe("abc123");
    expect(log.outcome).toBe("ok");
  });

  it("falls back to $metadata when $workers is absent", () => {
    const event = makeEvent({
      $metadata: {
        id: "req-2",
        service: "svc",
        level: "info",
        message: "hello",
        statusCode: 404,
        duration: 50,
        url: "https://meta.com",
        type: "request",
      },
    });

    const log = parseEvent(event);

    expect(log.requestUrl).toBe("https://meta.com");
    expect(log.statusCode).toBe(404);
    expect(log.duration).toBe(50);
    expect(log.eventType).toBe("request");
  });

  it("uses scriptName as service when $metadata.service is missing", () => {
    const event = makeEvent({
      $metadata: { id: "req-3" },
      $workers: {
        scriptName: "fallback-worker",
        outcome: "ok",
        eventType: "fetch",
        event: {},
      },
    });

    expect(parseEvent(event).service).toBe("fallback-worker");
  });

  it.each([
    ["service", "unknown", makeEvent({ $metadata: { id: "x" } })],
    ["level", "info", makeEvent({ $metadata: { id: "x" } })],
    ["message", "", makeEvent({ $metadata: { id: "x" } })],
  ] as const)('defaults %s to "%s" when missing', (field, expected, event) => {
    const log = parseEvent(event);

    expect(log[field]).toBe(expected);
  });

  it("uses trigger as message fallback", () => {
    const event = makeEvent({ $metadata: { id: "req-6", trigger: "cron" } });

    expect(parseEvent(event).message).toBe("cron");
  });
});

describe("parseEvents", () => {
  it("maps an array of events to log entries", () => {
    const events = [
      makeEvent({ $metadata: { id: "a" } }),
      makeEvent({ $metadata: { id: "b" } }),
    ];

    const logs = parseEvents(events);

    expect(logs).toHaveLength(2);
    expect(logs[0].requestId).toBe("a");
    expect(logs[1].requestId).toBe("b");
  });

  it("returns an empty array for empty input", () => {
    expect(parseEvents([])).toEqual([]);
  });
});

describe("dedup", () => {
  it("keeps the first occurrence of each requestId", () => {
    const logs = [
      { requestId: "a", timestamp: 1, level: "info", message: "first", service: "s" },
      { requestId: "b", timestamp: 2, level: "info", message: "unique", service: "s" },
      { requestId: "a", timestamp: 3, level: "error", message: "second", service: "s" },
    ] as any[];

    const result = dedup(logs);

    expect(result).toHaveLength(2);
    expect(result[0].message).toBe("first");
    expect(result[1].message).toBe("unique");
  });

  it("returns an empty array for empty input", () => {
    expect(dedup([])).toEqual([]);
  });
});
