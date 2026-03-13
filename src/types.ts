// ═══════════════════════════════════════════════════════════════
// ────────── Client Options ────────────────────────────────────

export interface ClientOptions {
  /** Cloudflare account ID */
  accountId: string;
  /** API token with "Workers Observability Write" permission */
  apiToken: string;
  /** Base URL override (defaults to https://api.cloudflare.com/client/v4) */
  baseUrl?: string;
}

// ═══════════════════════════════════════════════════════════════
// ────────── Timeframe ─────────────────────────────────────────

export interface Timeframe {
  /** Start time as Unix timestamp in milliseconds */
  from: number;
  /** End time as Unix timestamp in milliseconds */
  to: number;
}

// ═══════════════════════════════════════════════════════════════
// ────────── Query ─────────────────────────────────────────────

export interface TelemetryFilter {
  key: string;
  operation: string;
  type: string;
  value?: string | number | boolean;
}

export interface TelemetryNeedle {
  value: string;
  isRegex: boolean;
  matchCase: boolean;
}

// ═══════════════════════════════════════════════════════════════
// ────────── Calculations & GroupBy ──────────────────────────

export type CalculationOperator =
  | "COUNT"
  | "SUM"
  | "AVG"
  | "MIN"
  | "MAX"
  | "P50"
  | "P90"
  | "P95"
  | "P99"
  | "COUNT_DISTINCT";

export interface Calculation {
  operator: CalculationOperator;
  key?: string;
}

export interface GroupBy {
  type: string;
  key: string;
  value: string;
  limit?: number;
  order?: "asc" | "desc";
}

export interface TelemetryQueryParameters {
  datasets: string[];
  filters: TelemetryFilter[];
  filterCombination?: string;
  calculations: Calculation[];
  groupBys: GroupBy[];
  needle?: TelemetryNeedle;
}

export interface TelemetryQuery {
  queryId: string;
  view: string;
  limit: number;
  timeframe: Timeframe;
  parameters: TelemetryQueryParameters;
}

// ═══════════════════════════════════════════════════════════════
// ────────── Event Response ────────────────────────────────────

export interface TelemetryEventWorkers {
  scriptName: string;
  outcome: string;
  eventType: string;
  cpuTimeMs?: number;
  wallTimeMs?: number;
  event: {
    request?: {
      url?: string;
      method?: string;
      path?: string;
    };
    response?: {
      status?: number;
    };
    rayId?: string;
  };
}

export interface TelemetryEventMetadata {
  id: string;
  service?: string;
  level?: string;
  duration?: number;
  statusCode?: number;
  error?: string;
  message?: string;
  url?: string;
  type?: string;
  trigger?: string;
}

export interface TelemetryEvent {
  timestamp: number;
  source?: unknown;
  $workers?: TelemetryEventWorkers;
  $metadata: TelemetryEventMetadata;
}

// ═══════════════════════════════════════════════════════════════
// ────────── Query Response ────────────────────────────────────

export interface QueryStatistics {
  bytes_read?: number;
  elapsed?: number;
  rows_read?: number;
  abr_level?: number;
}

export interface TelemetryQueryResponse {
  success: boolean;
  errors: Array<{ message: string }>;
  messages: Array<{ message: string }>;
  result: {
    events?: {
      events?: TelemetryEvent[];
      count?: number;
    };
    invocations?: unknown;
    patterns?: unknown;
    traces?: unknown;
    calculations?: unknown[];
    compare?: unknown[];
    statistics?: QueryStatistics;
    run?: {
      id: string;
      accountId: string;
      status: string;
      timeframe: Timeframe;
      statistics?: QueryStatistics;
      created: string;
      updated: string;
    };
  };
}

// ═══════════════════════════════════════════════════════════════
// ────────── Keys Response ─────────────────────────────────────

export interface TelemetryKey {
  key: string;
  lastSeenAt: number;
  type: string;
}

export interface TelemetryKeysResponse {
  success: boolean;
  errors: Array<{ message: string }>;
  messages: Array<{ message: string }>;
  result: TelemetryKey[];
}

// ═══════════════════════════════════════════════════════════════
// ────────── Values ────────────────────────────────────────────

export interface TelemetryValuesRequest {
  datasets: string[];
  key: string;
  timeframe: Timeframe;
  type: string;
}

export interface TelemetryValue {
  dataset: string;
  key: string;
  type: string;
  value: string;
}

export interface TelemetryValuesResponse {
  success: boolean;
  errors: Array<{ message: string }>;
  messages: Array<{ message: string }>;
  result: TelemetryValue[];
}

// ═══════════════════════════════════════════════════════════════
// ────────── Parsed Log Entry ──────────────────────────────────

export interface WorkerLogEntry {
  requestId: string;
  timestamp: number;
  level: string;
  message: string;
  service: string;
  requestUrl?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  rayId?: string;
  outcome?: string;
  eventType?: string;
  source?: unknown;
}
