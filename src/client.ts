import type {
  ClientOptions,
  TelemetryEvent,
  TelemetryKey,
  TelemetryKeysResponse,
  TelemetryQuery,
  TelemetryQueryResponse,
  TelemetryValue,
  TelemetryValuesRequest,
  TelemetryValuesResponse,
  WorkerLogEntry,
} from "./types";
import { classifyError } from "./errors";
import { parseEvents } from "./parse";

const DEFAULT_BASE_URL = "https://api.cloudflare.com/client/v4";

export interface ObservabilityClient {
  query(query: TelemetryQuery): Promise<TelemetryQueryResponse>;
  queryEvents(query: TelemetryQuery): Promise<TelemetryEvent[]>;
  queryLogs(query: TelemetryQuery): Promise<WorkerLogEntry[]>;
  queryPaginated(query: TelemetryQuery): AsyncGenerator<TelemetryEvent[], void, undefined>;
  listKeys(): Promise<TelemetryKey[]>;
  listValues(request: TelemetryValuesRequest): Promise<TelemetryValue[]>;
}

/**
 * createClient
 *
 * Creates an HTTP client for the Cloudflare Workers Observability Telemetry API.
 * Posts queries to /telemetry/query and returns raw events, parsed logs, or full responses.
 * Returns empty arrays when no events match.
 * Paginates large result sets via an async iterator that adjusts timeframe between pages.
 * Stops iteration on empty or partial pages.
 * Throws ObservabilityError with a classified code (auth, validation, rate_limit, server, unknown).
 */
export function createClient(options: ClientOptions): ObservabilityClient {
  const { accountId, apiToken } = options;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  async function post<T>(path: string, body: unknown): Promise<T> {
    const url = `${baseUrl}/accounts/${accountId}/workers/observability${path}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      const retryAfter = response.headers.get("retry-after");
      throw classifyError(response.status, text, retryAfter);
    }

    return response.json() as Promise<T>;
  }

  async function query(q: TelemetryQuery): Promise<TelemetryQueryResponse> {
    return post<TelemetryQueryResponse>("/telemetry/query", q);
  }

  async function queryEvents(q: TelemetryQuery): Promise<TelemetryEvent[]> {
    const response = await query(q);
    return response.result?.events?.events ?? [];
  }

  async function queryLogs(q: TelemetryQuery): Promise<WorkerLogEntry[]> {
    const events = await queryEvents(q);
    return parseEvents(events);
  }

  async function* queryPaginated(
    q: TelemetryQuery,
  ): AsyncGenerator<TelemetryEvent[], void, undefined> {
    let currentQuery = { ...q, timeframe: { ...q.timeframe } };

    while (true) {
      const events = await queryEvents(currentQuery);
      if (events.length === 0) break;

      yield events;

      if (events.length < currentQuery.limit) break;

      const oldestTimestamp = Math.min(...events.map((e) => e.timestamp));
      currentQuery = {
        ...currentQuery,
        timeframe: { ...currentQuery.timeframe, to: oldestTimestamp - 1 },
      };
    }
  }

  async function listKeys(): Promise<TelemetryKey[]> {
    const response = await post<TelemetryKeysResponse>("/telemetry/keys", {});
    return response.result;
  }

  async function listValues(request: TelemetryValuesRequest): Promise<TelemetryValue[]> {
    const response = await post<TelemetryValuesResponse>("/telemetry/values", request);
    return response.result;
  }

  return { query, queryEvents, queryLogs, queryPaginated, listKeys, listValues };
}
