import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../client";
import { ObservabilityError } from "../errors";
import type { TelemetryQueryResponse } from "../types";
import { buildQuery } from "../query-builder";

// ───── Helpers ──────────────────────────────────────────────

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function mockFetchFail(status: number, body = "", headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  });
}

function mockFetchSequence(responses: Array<{ body: unknown; status: number }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Headers(),
      json: () => Promise.resolve(r.body),
      text: () => Promise.resolve(typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    });
  }
  return fn;
}

const queryResponse: TelemetryQueryResponse = {
  success: true,
  errors: [],
  messages: [],
  result: {
    events: {
      events: [
        { timestamp: 1710000000000, $metadata: { id: "req-1", service: "svc", level: "info", message: "ok" } },
      ],
      count: 1,
    },
  },
};

const emptyResponse = { success: true, errors: [], messages: [], result: {} };

function makeClient() {
  return createClient({
    accountId: "acct-1",
    apiToken: "tok-1",
    baseUrl: "https://api.test.com/client/v4",
  });
}

const query = buildQuery().last(3_600_000).limit(10).build();

// ───── Tests ────────────────────────────────────────────────

describe("createClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("query", () => {
    it("posts to the correct Cloudflare API URL with bearer auth", async () => {
      const fetchMock = mockFetchOk(queryResponse);
      globalThis.fetch = fetchMock;

      await makeClient().query(query);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.test.com/client/v4/accounts/acct-1/workers/observability/telemetry/query");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer tok-1");
      expect(init.headers["Content-Type"]).toBe("application/json");
    });

    it("returns the full API response", async () => {
      globalThis.fetch = mockFetchOk(queryResponse);

      const result = await makeClient().query(query);

      expect(result.success).toBe(true);
      expect(result.result.events?.events).toHaveLength(1);
    });
  });

  describe("queryEvents", () => {
    it("returns only the events array", async () => {
      globalThis.fetch = mockFetchOk(queryResponse);

      const events = await makeClient().queryEvents(query);

      expect(events).toHaveLength(1);
      expect(events[0].$metadata.id).toBe("req-1");
    });

    it("returns an empty array when no events match", async () => {
      globalThis.fetch = mockFetchOk(emptyResponse);

      const events = await makeClient().queryEvents(query);

      expect(events).toEqual([]);
    });
  });

  describe("queryLogs", () => {
    it("returns parsed WorkerLogEntry objects", async () => {
      globalThis.fetch = mockFetchOk(queryResponse);

      const logs = await makeClient().queryLogs(query);

      expect(logs).toHaveLength(1);
      expect(logs[0].requestId).toBe("req-1");
      expect(logs[0].service).toBe("svc");
    });
  });

  describe("listKeys", () => {
    it("posts to /telemetry/keys and returns result", async () => {
      const keysBody = {
        success: true, errors: [], messages: [],
        result: [{ key: "$metadata.service", lastSeenAt: 1710000000, type: "string" }],
      };
      const fetchMock = mockFetchOk(keysBody);
      globalThis.fetch = fetchMock;

      const keys = await makeClient().listKeys();

      expect(fetchMock.mock.calls[0][0]).toContain("/telemetry/keys");
      expect(keys[0].key).toBe("$metadata.service");
    });
  });

  describe("listValues", () => {
    it("posts to /telemetry/values with the request body", async () => {
      const valuesBody = {
        success: true, errors: [], messages: [],
        result: [{ dataset: "cloudflare-workers", key: "$metadata.service", type: "string", value: "my-worker" }],
      };
      const fetchMock = mockFetchOk(valuesBody);
      globalThis.fetch = fetchMock;

      const values = await makeClient().listValues({
        datasets: ["cloudflare-workers"],
        key: "$metadata.service",
        type: "string",
        timeframe: { from: 0, to: 1 },
      });

      expect(fetchMock.mock.calls[0][0]).toContain("/telemetry/values");
      expect(values[0].value).toBe("my-worker");
    });
  });

  describe("errors", () => {
    it.each([
      [401, "auth"],
      [403, "auth"],
      [400, "validation"],
      [429, "rate_limit"],
      [500, "server"],
    ] as const)("throws ObservabilityError with code %s for HTTP %i", async (status, expectedCode) => {
      globalThis.fetch = mockFetchFail(status);

      try {
        await makeClient().query(query);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ObservabilityError);
        expect((e as ObservabilityError).code).toBe(expectedCode);
      }
    });

    it("includes retryAfterMs on rate limit errors", async () => {
      globalThis.fetch = mockFetchFail(429, "rate limited", { "retry-after": "5" });

      try {
        await makeClient().query(query);
        expect.unreachable();
      } catch (e) {
        expect((e as ObservabilityError).retryAfterMs).toBe(5000);
      }
    });
  });

  describe("pagination", () => {
    it("yields multiple batches until a partial page", async () => {
      globalThis.fetch = mockFetchSequence([
        {
          body: { success: true, errors: [], messages: [], result: { events: { events: [{ timestamp: 1000, $metadata: { id: "a" } }, { timestamp: 900, $metadata: { id: "b" } }] } } },
          status: 200,
        },
        {
          body: { success: true, errors: [], messages: [], result: { events: { events: [{ timestamp: 800, $metadata: { id: "c" } }] } } },
          status: 200,
        },
      ]);

      const batches: unknown[][] = [];
      const paginatedQuery = buildQuery().timeframe(0, 2000).limit(2).build();
      for await (const batch of makeClient().queryPaginated(paginatedQuery)) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(2);
      expect(batches[0]).toHaveLength(2);
      expect(batches[1]).toHaveLength(1);
    });

    it("yields zero batches when the first page is empty", async () => {
      globalThis.fetch = mockFetchOk({
        success: true, errors: [], messages: [], result: { events: { events: [] } },
      });

      const batches: unknown[][] = [];
      for await (const batch of makeClient().queryPaginated(query)) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(0);
    });

    it("adjusts timeframe.to to oldest timestamp minus 1ms between pages", async () => {
      const fetchMock = mockFetchSequence([
        {
          body: { success: true, errors: [], messages: [], result: { events: { events: [{ timestamp: 1000, $metadata: { id: "a" } }, { timestamp: 500, $metadata: { id: "b" } }] } } },
          status: 200,
        },
        {
          body: { success: true, errors: [], messages: [], result: { events: { events: [] } } },
          status: 200,
        },
      ]);
      globalThis.fetch = fetchMock;

      const paginatedQuery = buildQuery().timeframe(0, 2000).limit(2).build();
      for await (const _ of makeClient().queryPaginated(paginatedQuery)) { /* drain */ }

      const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(secondBody.timeframe).toEqual({ from: 0, to: 499 });
    });
  });

  it("allows destructuring without losing context", async () => {
    globalThis.fetch = mockFetchOk(queryResponse);

    const { queryEvents } = makeClient();
    const events = await queryEvents(query);

    expect(events).toHaveLength(1);
  });
});
