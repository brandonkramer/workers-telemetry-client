import type {
  Calculation,
  CalculationOperator,
  GroupBy,
  TelemetryFilter,
  TelemetryNeedle,
  TelemetryQuery,
  Timeframe,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// ────────── Duration Parsing ────────────────────────────────

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * parseDuration
 *
 * Converts a human-readable duration string into milliseconds.
 * Supports units: ms, s, m, h, d, w — and fractional values like "1.5h".
 * Rejects strings with unrecognized units or missing numeric parts.
 *
 * @example
 * ```ts
 * parseDuration("5m")   // 300000
 * parseDuration("1h")   // 3600000
 * parseDuration("7d")   // 604800000
 * parseDuration("500ms") // 500
 * ```
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/);
  if (!match) {
    throw new Error(
      `Invalid duration "${duration}". Use a number followed by ms, s, m, h, d, or w.`,
    );
  }
  return parseFloat(match[1]) * DURATION_UNITS[match[2]];
}

// ═══════════════════════════════════════════════════════════════
// ────────── Query Builder ───────────────────────────────────

/**
 * QueryBuilder
 *
 * Fluent builder for TelemetryQuery objects.
 * Defaults to events view, 100 limit, and cloudflare-workers dataset.
 * Accepts time ranges as raw milliseconds, duration strings, or named presets.
 * Supports typed calculations (count, sum, avg, min, max, percentiles) and group-by clauses.
 * Supports text search with optional regex and case sensitivity.
 * All methods return `this` for chaining.
 */
export class QueryBuilder {
  private _queryId = "query";
  private _view = "events";
  private _limit = 100;
  private _timeframe: Timeframe = { from: 0, to: 0 };
  private _datasets: string[] = ["cloudflare-workers"];
  private _filters: TelemetryFilter[] = [];
  private _filterCombination?: string;
  private _calculations: Calculation[] = [];
  private _groupBys: GroupBy[] = [];
  private _needle?: TelemetryNeedle;

  /** Set the query ID for tracking. */
  queryId(id: string): this {
    this._queryId = id;
    return this;
  }

  /** Set the view type (e.g. "events", "calculations"). */
  view(view: string): this {
    this._view = view;
    return this;
  }

  /** Maximum number of results to return. */
  limit(limit: number): this {
    this._limit = limit;
    return this;
  }

  /** Set the time range using Unix timestamps in milliseconds. */
  timeframe(from: number, to: number): this {
    this._timeframe = { from, to };
    return this;
  }

  /**
   * Set the time range relative to now.
   * Accepts milliseconds (number) or a human-readable duration string.
   *
   * @example
   * ```ts
   * .last(3600000)   // last hour (ms)
   * .last("1h")      // last hour (string)
   * .last("30m")     // last 30 minutes
   * .last("7d")      // last 7 days
   * ```
   */
  last(duration: number | string): this {
    const ms = typeof duration === "string" ? parseDuration(duration) : duration;
    const now = Date.now();
    this._timeframe = { from: now - ms, to: now };
    return this;
  }

  /** Query the last hour. */
  lastHour(): this {
    return this.last(3_600_000);
  }

  /** Query the last 24 hours. */
  last24Hours(): this {
    return this.last(86_400_000);
  }

  /** Query the last 7 days. */
  last7Days(): this {
    return this.last(604_800_000);
  }

  /** Query the last 30 days. */
  last30Days(): this {
    return this.last(2_592_000_000);
  }

  /** Query from midnight today until now. */
  today(): this {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    this._timeframe = { from: midnight, to: now.getTime() };
    return this;
  }

  /** Set datasets to query (defaults to ["cloudflare-workers"]). */
  datasets(datasets: string[]): this {
    this._datasets = datasets;
    return this;
  }

  /** Add a filter. */
  filter(key: string, operation: string, value?: string | number | boolean, type = "string"): this {
    this._filters.push({ key, operation, type, value });
    return this;
  }

  /** Filter by Worker script/service name. */
  service(name: string): this {
    return this.filter("$metadata.service", "eq", name);
  }

  /** Set how filters are combined ("AND" or "OR"). */
  filterCombination(combination: string): this {
    this._filterCombination = combination;
    return this;
  }

  /** Search for a text pattern in log content. */
  search(value: string, options?: { regex?: boolean; caseSensitive?: boolean }): this {
    this._needle = {
      value,
      isRegex: options?.regex ?? false,
      matchCase: options?.caseSensitive ?? false,
    };
    return this;
  }

  // ───── Typed Calculations ─────────────────────────────────

  /** Add a calculation. */
  calculate(operator: CalculationOperator, key?: string): this {
    this._calculations.push({ operator, key });
    return this;
  }

  /** Count all matching events. */
  count(): this {
    return this.calculate("COUNT");
  }

  /** Count distinct values of a key. */
  countDistinct(key: string): this {
    return this.calculate("COUNT_DISTINCT", key);
  }

  /** Sum a numeric key. */
  sum(key: string): this {
    return this.calculate("SUM", key);
  }

  /** Average of a numeric key. */
  avg(key: string): this {
    return this.calculate("AVG", key);
  }

  /** Minimum of a numeric key. */
  min(key: string): this {
    return this.calculate("MIN", key);
  }

  /** Maximum of a numeric key. */
  max(key: string): this {
    return this.calculate("MAX", key);
  }

  /** 50th percentile of a numeric key. */
  p50(key: string): this {
    return this.calculate("P50", key);
  }

  /** 90th percentile of a numeric key. */
  p90(key: string): this {
    return this.calculate("P90", key);
  }

  /** 95th percentile of a numeric key. */
  p95(key: string): this {
    return this.calculate("P95", key);
  }

  /** 99th percentile of a numeric key. */
  p99(key: string): this {
    return this.calculate("P99", key);
  }

  /**
   * Set calculations directly. Accepts typed Calculation objects.
   */
  calculations(calculations: Calculation[]): this {
    this._calculations = calculations;
    return this;
  }

  // ───── Typed Group By ─────────────────────────────────────

  /**
   * Add a group-by clause.
   *
   * @example
   * ```ts
   * .groupBy("$metadata.service")
   * .groupBy("$workers.outcome", { limit: 10, order: "desc" })
   * ```
   */
  groupBy(key: string, options?: { type?: string; limit?: number; order?: "asc" | "desc" }): this {
    this._groupBys.push({
      type: options?.type ?? "string",
      key,
      value: key,
      limit: options?.limit,
      order: options?.order,
    });
    return this;
  }

  /**
   * Set group-by clauses directly. Accepts typed GroupBy objects.
   */
  groupBys(groupBys: GroupBy[]): this {
    this._groupBys = groupBys;
    return this;
  }

  /** Build the query object. */
  build(): TelemetryQuery {
    return {
      queryId: this._queryId,
      view: this._view,
      limit: this._limit,
      timeframe: this._timeframe,
      parameters: {
        datasets: this._datasets,
        filters: this._filters,
        ...(this._filterCombination && { filterCombination: this._filterCombination }),
        calculations: this._calculations,
        groupBys: this._groupBys,
        ...(this._needle && { needle: this._needle }),
      },
    };
  }
}

/**
 * Create a new query builder.
 *
 * @example
 * ```ts
 * const query = buildQuery()
 *   .service("my-worker")
 *   .last("1h")
 *   .search("error")
 *   .count()
 *   .avg("$workers.wallTimeMs")
 *   .p95("$workers.wallTimeMs")
 *   .groupBy("$metadata.service")
 *   .limit(50)
 *   .build();
 * ```
 */
export function buildQuery(): QueryBuilder {
  return new QueryBuilder();
}
