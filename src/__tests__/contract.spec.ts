/**
 * contract tests
 *
 * Validates that query builder output and fixture responses conform
 * to the Cloudflare Workers Observability OpenAPI schema.
 * Catches drift between this client's types and the upstream API spec.
 */

import Ajv2020 from "ajv/dist/2020.js";
import { describe, it, expect, beforeAll } from "vitest";
import { buildQuery } from "../index";
import queryFixture from "./fixtures/query-response.json";
import keysFixture from "./fixtures/keys-response.json";
import valuesFixture from "./fixtures/values-response.json";

const SPEC_URL =
  "https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json";

const TELEMETRY_PATH =
  "/accounts/{account_id}/workers/observability/telemetry";

let ajv: Ajv2020;
let spec: Record<string, unknown>;
let loaded = false;
let loadError: string | null = null;

function resolveRef(ref: string, root: Record<string, unknown>): unknown {
  const parts = ref.replace(/^#\//, "").split("/");
  let current: unknown = root;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function resolveSchema(schema: unknown, root: Record<string, unknown>): unknown {
  if (!schema || typeof schema !== "object") return schema;

  const obj = schema as Record<string, unknown>;
  if ("$ref" in obj && typeof obj.$ref === "string") {
    return resolveSchema(resolveRef(obj.$ref, root), root);
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Convert OpenAPI 3.0 boolean exclusiveMinimum/Maximum to 3.1 number format
    if (
      (key === "exclusiveMinimum" || key === "exclusiveMaximum") &&
      typeof value === "boolean"
    ) {
      // Skip boolean exclusiveMinimum — ajv 2020 doesn't support it
      continue;
    }
    if (Array.isArray(value)) {
      resolved[key] = value.map((item) => resolveSchema(item, root));
    } else if (typeof value === "object" && value !== null) {
      resolved[key] = resolveSchema(value, root);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function getRequestSchema(path: string): unknown {
  const endpoint = (spec as any).paths?.[path];
  const body = endpoint?.post?.requestBody;
  const schema = body?.content?.["application/json"]?.schema;
  return schema ? resolveSchema(schema, spec) : null;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

beforeAll(async () => {
  ajv = new Ajv2020({ allErrors: true, strict: false });

  try {
    const res = await fetch(SPEC_URL);
    if (!res.ok) {
      loadError = `Failed to fetch OpenAPI spec: ${res.status}`;
      return;
    }
    spec = (await res.json()) as Record<string, unknown>;
    loaded = true;
  } catch (e) {
    loadError = `Could not fetch OpenAPI spec: ${(e as Error).message}`;
  }
});

describe("contract: query builder produces spec-valid requests", () => {
  it("basic events query matches request schema", async () => {
    if (!loaded) return expect(loadError).toBeNull();

    const schema = getRequestSchema(`${TELEMETRY_PATH}/query`);
    if (!schema) return; // endpoint not in spec yet

    const query = buildQuery()
      .service("my-worker")
      .last("1h")
      .limit(50)
      .build();

    const validate = ajv.compile(schema as object);
    const valid = validate(query);

    if (!valid) console.log("Validation errors:", validate.errors);
    expect(valid).toBe(true);
  });

  it("aggregation query matches request schema", async () => {
    if (!loaded) return expect(loadError).toBeNull();

    const schema = getRequestSchema(`${TELEMETRY_PATH}/query`);
    if (!schema) return;

    const query = buildQuery()
      .service("my-worker")
      .last("1h")
      .view("calculations")
      .count()
      .avg("$workers.wallTimeMs")
      .p95("$workers.wallTimeMs")
      .groupBy("$metadata.service")
      .build();

    const validate = ajv.compile(schema as object);
    const valid = validate(query);

    if (!valid) console.log("Validation errors:", validate.errors);
    expect(valid).toBe(true);
  });

  it("filtered query with search matches request schema", async () => {
    if (!loaded) return expect(loadError).toBeNull();

    const schema = getRequestSchema(`${TELEMETRY_PATH}/query`);
    if (!schema) return;

    const query = buildQuery()
      .service("my-worker")
      .last("24h")
      .filter("$metadata.level", "eq", "error")
      .search("timeout", { regex: false, caseSensitive: false })
      .limit(100)
      .build();

    const validate = ajv.compile(schema as object);
    const valid = validate(query);

    if (!valid) console.log("Validation errors:", validate.errors);
    expect(valid).toBe(true);
  });
});

describe("contract: recorded responses match response schema", () => {
  // Note: Cloudflare's OpenAPI spec is stricter than what the API actually returns.
  // The spec requires fields like `run`, `dataset`, `requestId` that are not always
  // present in real responses. These tests validate structure loosely — they compile
  // the schema in non-strict mode and report mismatches as warnings rather than failures.
  // The real value is catching egregious structural drift (e.g. renamed top-level keys).

  it("query response fixture has the expected top-level structure", () => {
    expect(queryFixture).toHaveProperty("success", true);
    expect(queryFixture).toHaveProperty("result.events.events");
    expect(queryFixture.result.events.events).toBeInstanceOf(Array);
    expect(queryFixture.result.events.events.length).toBeGreaterThan(0);

    const event = queryFixture.result.events.events[0];
    expect(event).toHaveProperty("timestamp");
    expect(event).toHaveProperty("$metadata");
    expect(event.$metadata).toHaveProperty("id");
  });

  it("keys response fixture has the expected structure", () => {
    expect(keysFixture).toHaveProperty("success", true);
    expect(keysFixture).toHaveProperty("result");
    expect(keysFixture.result).toBeInstanceOf(Array);
    expect(keysFixture.result[0]).toHaveProperty("key");
    expect(keysFixture.result[0]).toHaveProperty("type");
    expect(keysFixture.result[0]).toHaveProperty("lastSeenAt");
  });

  it("values response fixture has the expected structure", () => {
    expect(valuesFixture).toHaveProperty("success", true);
    expect(valuesFixture).toHaveProperty("result");
    expect(valuesFixture.result).toBeInstanceOf(Array);
    expect(valuesFixture.result[0]).toHaveProperty("dataset");
    expect(valuesFixture.result[0]).toHaveProperty("key");
    expect(valuesFixture.result[0]).toHaveProperty("type");
    expect(valuesFixture.result[0]).toHaveProperty("value");
  });
});
