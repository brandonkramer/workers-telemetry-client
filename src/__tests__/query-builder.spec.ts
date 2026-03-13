import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildQuery, parseDuration } from "../query-builder";

describe("parseDuration", () => {
  it.each([
    ["500ms", 500],
    ["30s",   30_000],
    ["5m",    300_000],
    ["1h",    3_600_000],
    ["7d",    604_800_000],
    ["2w",    1_209_600_000],
  ])('converts "%s" to %i milliseconds', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it("converts fractional values", () => {
    expect(parseDuration("1.5h")).toBe(5_400_000);
  });

  it.each(["abc", "5x", ""])('throws for invalid input "%s"', (input) => {
    expect(() => parseDuration(input)).toThrow(`Invalid duration "${input}"`);
  });
});

describe("QueryBuilder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces sensible defaults", () => {
    const query = buildQuery().build();

    expect(query.queryId).toBe("query");
    expect(query.view).toBe("events");
    expect(query.limit).toBe(100);
    expect(query.parameters.datasets).toEqual(["cloudflare-workers"]);
    expect(query.parameters.filters).toEqual([]);
    expect(query.parameters.calculations).toEqual([]);
    expect(query.parameters.groupBys).toEqual([]);
  });

  it("chains all setters fluently", () => {
    const query = buildQuery()
      .queryId("test")
      .view("calculations")
      .limit(50)
      .datasets(["custom"])
      .build();

    expect(query.queryId).toBe("test");
    expect(query.view).toBe("calculations");
    expect(query.limit).toBe(50);
    expect(query.parameters.datasets).toEqual(["custom"]);
  });

  describe("time ranges", () => {
    it("accepts raw milliseconds", () => {
      const query = buildQuery().last(60_000).build();

      const now = Date.now();
      expect(query.timeframe).toEqual({ from: now - 60_000, to: now });
    });

    it("accepts a duration string", () => {
      const query = buildQuery().last("5m").build();

      const now = Date.now();
      expect(query.timeframe).toEqual({ from: now - 300_000, to: now });
    });

    it("accepts explicit from/to timestamps", () => {
      const query = buildQuery().timeframe(1000, 2000).build();

      expect(query.timeframe).toEqual({ from: 1000, to: 2000 });
    });

    it.each([
      ["lastHour",    3_600_000],
      ["last24Hours", 86_400_000],
      ["last7Days",   604_800_000],
      ["last30Days",  2_592_000_000],
    ] as const)("%s sets the correct range", (method, expectedMs) => {
      const query = (buildQuery() as any)[method]().build();

      expect(query.timeframe.from).toBe(Date.now() - expectedMs);
      expect(query.timeframe.to).toBe(Date.now());
    });

    it("today starts from midnight", () => {
      const query = buildQuery().today().build();

      const now = Date.now();
      expect(query.timeframe.from).toBeLessThanOrEqual(now);
      expect(query.timeframe.to).toBe(now);
    });
  });

  describe("filters", () => {
    it("adds a service filter via .service()", () => {
      const query = buildQuery().service("my-worker").build();

      expect(query.parameters.filters).toEqual([
        { key: "$metadata.service", operation: "eq", type: "string", value: "my-worker" },
      ]);
    });

    it("combines multiple filters with AND", () => {
      const query = buildQuery()
        .service("my-worker")
        .filter("$metadata.level", "eq", "error")
        .filterCombination("AND")
        .build();

      expect(query.parameters.filters).toHaveLength(2);
      expect(query.parameters.filterCombination).toBe("AND");
    });
  });

  describe("search", () => {
    it("sets needle with default options", () => {
      const query = buildQuery().search("timeout").build();

      expect(query.parameters.needle).toEqual({
        value: "timeout",
        isRegex: false,
        matchCase: false,
      });
    });

    it("sets needle with regex and case sensitivity", () => {
      const query = buildQuery()
        .search("error.*fatal", { regex: true, caseSensitive: true })
        .build();

      expect(query.parameters.needle).toEqual({
        value: "error.*fatal",
        isRegex: true,
        matchCase: true,
      });
    });

    it("omits needle when search is not called", () => {
      const query = buildQuery().build();

      expect(query.parameters).not.toHaveProperty("needle");
    });
  });

  describe("calculations", () => {
    it.each([
      ["count",         "COUNT",          undefined],
      ["sum",           "SUM",            "$workers.wallTimeMs"],
      ["avg",           "AVG",            "$workers.wallTimeMs"],
      ["min",           "MIN",            "$workers.wallTimeMs"],
      ["max",           "MAX",            "$workers.wallTimeMs"],
      ["p50",           "P50",            "latency"],
      ["p90",           "P90",            "latency"],
      ["p95",           "P95",            "latency"],
      ["p99",           "P99",            "latency"],
      ["countDistinct", "COUNT_DISTINCT", "$metadata.service"],
    ] as const)(".%s() produces operator %s", (method, operator, key) => {
      const builder = buildQuery() as any;
      const query = key ? builder[method](key).build() : builder[method]().build();

      expect(query.parameters.calculations).toEqual([
        key ? { operator, key } : { operator },
      ]);
    });

    it("chains multiple calculations on one query", () => {
      const query = buildQuery()
        .count()
        .avg("$workers.wallTimeMs")
        .p95("$workers.wallTimeMs")
        .build();

      expect(query.parameters.calculations).toHaveLength(3);
    });

    it("sets calculations directly via .calculations()", () => {
      const calcs = [{ operator: "COUNT" as const }, { operator: "SUM" as const, key: "x" }];

      const query = buildQuery().calculations(calcs).build();

      expect(query.parameters.calculations).toEqual(calcs);
    });
  });

  describe("groupBy", () => {
    it("adds a group-by with default type", () => {
      const query = buildQuery().groupBy("$metadata.service").build();

      expect(query.parameters.groupBys).toEqual([
        { type: "string", key: "$metadata.service", value: "$metadata.service", limit: undefined, order: undefined },
      ]);
    });

    it("adds a group-by with limit and order", () => {
      const query = buildQuery()
        .groupBy("$workers.outcome", { limit: 10, order: "desc" })
        .build();

      expect(query.parameters.groupBys).toEqual([
        { type: "string", key: "$workers.outcome", value: "$workers.outcome", limit: 10, order: "desc" },
      ]);
    });

    it("chains multiple group-bys", () => {
      const query = buildQuery()
        .groupBy("$metadata.service")
        .groupBy("$metadata.level")
        .build();

      expect(query.parameters.groupBys).toHaveLength(2);
    });

    it("sets group-bys directly via .groupBys()", () => {
      const groups = [{ type: "string", key: "svc", value: "svc" }];

      const query = buildQuery().groupBys(groups).build();

      expect(query.parameters.groupBys).toEqual(groups);
    });
  });

  it("builds a complex query with all features", () => {
    const query = buildQuery()
      .queryId("complex")
      .view("calculations")
      .service("api-worker")
      .last("1h")
      .filter("$metadata.level", "eq", "error")
      .filterCombination("AND")
      .search("timeout")
      .count()
      .avg("$workers.wallTimeMs")
      .p95("$workers.wallTimeMs")
      .groupBy("$metadata.service")
      .limit(200)
      .build();

    expect(query.queryId).toBe("complex");
    expect(query.view).toBe("calculations");
    expect(query.limit).toBe(200);
    expect(query.parameters.filters).toHaveLength(2);
    expect(query.parameters.filterCombination).toBe("AND");
    expect(query.parameters.needle?.value).toBe("timeout");
    expect(query.parameters.calculations).toHaveLength(3);
    expect(query.parameters.groupBys).toHaveLength(1);
  });
});
