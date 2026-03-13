/**
 * client (MSW record/replay)
 *
 * Tests the client against recorded Cloudflare API responses.
 * Verifies that parsing, dedup, and response handling work
 * against realistic response shapes — not hand-crafted mocks.
 */

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createClient, buildQuery } from "../index";
import queryFixture from "./fixtures/query-response.json";
import keysFixture from "./fixtures/keys-response.json";
import valuesFixture from "./fixtures/values-response.json";

const BASE = "https://api.cloudflare.com/client/v4";
const ACCOUNT = "test-account";

const server = setupServer(
  http.post(`${BASE}/accounts/:accountId/workers/observability/telemetry/query`, () => {
    return HttpResponse.json(queryFixture);
  }),
  http.post(`${BASE}/accounts/:accountId/workers/observability/telemetry/keys`, () => {
    return HttpResponse.json(keysFixture);
  }),
  http.post(`${BASE}/accounts/:accountId/workers/observability/telemetry/values`, () => {
    return HttpResponse.json(valuesFixture);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createClient({ accountId: ACCOUNT, apiToken: "test-token" });

describe("client against recorded responses", () => {
  describe("queryEvents", () => {
    it("returns all events from a recorded response", async () => {
      const events = await client.queryEvents(
        buildQuery().service("api-gateway").last("1h").limit(10).build(),
      );

      expect(events).toHaveLength(3);
    });

    it("preserves timestamps from recorded events", async () => {
      const events = await client.queryEvents(
        buildQuery().service("api-gateway").last("1h").limit(10).build(),
      );

      expect(events[0].timestamp).toBe(1710000000000);
      expect(events[1].timestamp).toBe(1709999990000);
      expect(events[2].timestamp).toBe(1709999980000);
    });

    it("preserves $workers fields from recorded events", async () => {
      const events = await client.queryEvents(
        buildQuery().service("api-gateway").last("1h").limit(10).build(),
      );

      expect(events[0].$workers?.scriptName).toBe("api-gateway");
      expect(events[0].$workers?.wallTimeMs).toBe(42);
      expect(events[0].$workers?.event.request?.method).toBe("GET");
      expect(events[0].$workers?.event.response?.status).toBe(200);
      expect(events[0].$workers?.event.rayId).toBe("abc123def456");
    });
  });

  describe("queryLogs", () => {
    it("parses recorded events into flat log entries", async () => {
      const logs = await client.queryLogs(
        buildQuery().service("api-gateway").last("1h").limit(10).build(),
      );

      expect(logs).toHaveLength(3);
      expect(logs[0]).toMatchObject({
        requestId: "req-001",
        level: "info",
        message: "Request completed",
        service: "api-gateway",
        requestUrl: "https://api.example.com/v1/users",
        method: "GET",
        statusCode: 200,
        duration: 42,
        rayId: "abc123def456",
        outcome: "ok",
      });
    });

    it("parses error events with correct level and message", async () => {
      const logs = await client.queryLogs(
        buildQuery().service("api-gateway").last("1h").limit(10).build(),
      );

      const errorLog = logs.find((l) => l.level === "error");
      expect(errorLog).toBeDefined();
      expect(errorLog!.message).toBe("Internal server error");
      expect(errorLog!.statusCode).toBe(500);
      expect(errorLog!.outcome).toBe("exception");
    });
  });

  describe("query", () => {
    it("returns the full response structure including statistics", async () => {
      const response = await client.query(
        buildQuery().service("api-gateway").last("1h").limit(10).build(),
      );

      expect(response.success).toBe(true);
      expect(response.result.events?.count).toBe(3);
      expect(response.result.statistics?.rows_read).toBe(3);
    });
  });

  describe("listKeys", () => {
    it("returns all keys from a recorded response", async () => {
      const keys = await client.listKeys();

      expect(keys).toHaveLength(8);
      expect(keys[0]).toMatchObject({
        key: "$metadata.service",
        type: "string",
        lastSeenAt: 1710000000,
      });
    });

    it("includes both $metadata and $workers keys", async () => {
      const keys = await client.listKeys();

      const metadataKeys = keys.filter((k) => k.key.startsWith("$metadata"));
      const workersKeys = keys.filter((k) => k.key.startsWith("$workers"));
      expect(metadataKeys.length).toBe(4);
      expect(workersKeys.length).toBe(4);
    });
  });

  describe("listValues", () => {
    it("returns all values from a recorded response", async () => {
      const values = await client.listValues({
        datasets: ["cloudflare-workers"],
        key: "$metadata.service",
        type: "string",
        timeframe: { from: 0, to: Date.now() },
      });

      expect(values).toHaveLength(3);
      expect(values.map((v) => v.value)).toEqual([
        "api-gateway",
        "auth-worker",
        "cron-handler",
      ]);
    });
  });

  describe("error responses", () => {
    it("throws ObservabilityError on auth failure", async () => {
      server.use(
        http.post(`${BASE}/accounts/:accountId/workers/observability/telemetry/query`, () => {
          return HttpResponse.json(
            { success: false, errors: [{ message: "Invalid token" }] },
            { status: 401 },
          );
        }),
      );

      await expect(
        client.queryEvents(buildQuery().last("1h").limit(10).build()),
      ).rejects.toMatchObject({ code: "auth", status: 401 });
    });

    it("throws ObservabilityError with retryAfterMs on rate limit", async () => {
      server.use(
        http.post(`${BASE}/accounts/:accountId/workers/observability/telemetry/query`, () => {
          return HttpResponse.json(
            { success: false, errors: [{ message: "Rate limited" }] },
            { status: 429, headers: { "retry-after": "30" } },
          );
        }),
      );

      await expect(
        client.queryEvents(buildQuery().last("1h").limit(10).build()),
      ).rejects.toMatchObject({ code: "rate_limit", retryAfterMs: 30000 });
    });
  });
});
