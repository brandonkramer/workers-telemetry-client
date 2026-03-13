# workers-telemetry-client

Lightweight, zero-dependency TypeScript client for the [Cloudflare Workers Observability Telemetry API](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/).

## Install

```bash
npm install @bk.cc/workers-telemetry-client
```

## Usage

### Client

```ts
import { createClient, buildQuery } from "@bk.cc/workers-telemetry-client";

const client = createClient({
  accountId: "your-account-id",
  apiToken: "your-api-token",
});

// Destructuring works — no `this` binding issues
const { queryEvents, listKeys } = createClient({ accountId, apiToken });
```

### Query events

```ts
const query = buildQuery()
  .service("my-worker")
  .last("1h")
  .search("error")
  .limit(50)
  .build();

const events = await client.queryEvents(query);

// Or get parsed & deduped log entries in one call
const logs = await client.queryLogs(query);
```

### Time range helpers

```ts
buildQuery().last("5m");       // last 5 minutes
buildQuery().last("2h");       // last 2 hours
buildQuery().last("7d");       // last 7 days
buildQuery().lastHour();       // last hour
buildQuery().last24Hours();    // last 24 hours
buildQuery().last7Days();      // last 7 days
buildQuery().last30Days();     // last 30 days
buildQuery().today();          // since midnight
buildQuery().last(3_600_000);  // raw milliseconds still works
```

### Aggregations

```ts
const query = buildQuery()
  .service("my-worker")
  .last("1h")
  .view("calculations")
  .count()
  .avg("$workers.wallTimeMs")
  .p95("$workers.wallTimeMs")
  .groupBy("$metadata.service")
  .build();

const response = await client.query(query);
```

Available calculation methods: `count()`, `countDistinct(key)`, `sum(key)`, `avg(key)`, `min(key)`, `max(key)`, `p50(key)`, `p90(key)`, `p95(key)`, `p99(key)`.

### Query with filters

```ts
const query = buildQuery()
  .service("my-worker")
  .timeframe(Date.now() - 3_600_000, Date.now())
  .filter("$metadata.level", "eq", "error")
  .search("timeout", { regex: false, caseSensitive: false })
  .limit(100)
  .build();

const response = await client.query(query);
```

### Pagination

Iterate through large result sets automatically:

```ts
const query = buildQuery()
  .service("my-worker")
  .last("24h")
  .limit(100)
  .build();

for await (const batch of client.queryPaginated(query)) {
  console.log(`Got ${batch.length} events`);
  // process batch...
}
```

### Error handling

All errors are thrown as `ObservabilityError` with a `code` to distinguish failure types:

```ts
import { ObservabilityError } from "@bk.cc/workers-telemetry-client";

try {
  await client.queryEvents(query);
} catch (error) {
  if (error instanceof ObservabilityError) {
    switch (error.code) {
      case "rate_limit":
        console.log(`Rate limited, retry after ${error.retryAfterMs}ms`);
        break;
      case "auth":
        console.log("Check your API token");
        break;
      case "validation":
        console.log("Invalid query:", error.body);
        break;
      case "server":
        console.log("Cloudflare server error");
        break;
    }
  }
}
```

### List available keys

```ts
const keys = await client.listKeys();
// [{ key: "$metadata.service", lastSeenAt: 1710000000, type: "string" }, ...]
```

### List values for a key

```ts
const values = await client.listValues({
  datasets: ["cloudflare-workers"],
  key: "$metadata.service",
  type: "string",
  timeframe: { from: Date.now() - 86_400_000, to: Date.now() },
});
```

### Parse events into log entries

Raw telemetry events have a deeply nested structure. `parseEvent` flattens them into a human-friendly `WorkerLogEntry`:

```ts
import { parseEvents, dedup } from "@bk.cc/workers-telemetry-client";

const logs = dedup(parseEvents(events));

for (const log of logs) {
  console.log(`[${log.level}] ${log.service}: ${log.message}`);
}
```

## API

### `createClient(options)` → `ObservabilityClient`

| Method | Returns | Description |
|---|---|---|
| `query(query)` | `TelemetryQueryResponse` | Execute a telemetry query (full response) |
| `queryEvents(query)` | `TelemetryEvent[]` | Execute a query and return only events |
| `queryLogs(query)` | `WorkerLogEntry[]` | Execute a query and return parsed log entries |
| `queryPaginated(query)` | `AsyncGenerator<TelemetryEvent[]>` | Paginate through all matching events |
| `listKeys()` | `TelemetryKey[]` | List all available telemetry keys |
| `listValues(request)` | `TelemetryValue[]` | List distinct values for a key |

### `ClientOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `accountId` | `string` | required | Cloudflare account ID |
| `apiToken` | `string` | required | API token |
| `baseUrl` | `string` | `https://api.cloudflare.com/client/v4` | Base URL override |

### `QueryBuilder` (via `buildQuery()`)

| Method | Description |
|---|---|
| `.queryId(id)` | Set query ID for tracking |
| `.view(view)` | Set view type (`"events"`, `"calculations"`) |
| `.limit(n)` | Max results to return |
| `.timeframe(from, to)` | Set time range (Unix ms) |
| `.last(duration)` | Relative time range (`"5m"`, `"1h"`, `"7d"`, or ms) |
| `.lastHour()` | Last hour preset |
| `.last24Hours()` | Last 24 hours preset |
| `.last7Days()` | Last 7 days preset |
| `.last30Days()` | Last 30 days preset |
| `.today()` | Since midnight today |
| `.datasets(ds)` | Set datasets (default: `["cloudflare-workers"]`) |
| `.service(name)` | Filter by Worker service name |
| `.filter(key, op, value?, type?)` | Add a filter |
| `.filterCombination(combo)` | Set filter combination (`"AND"` / `"OR"`) |
| `.search(value, opts?)` | Search log content |
| `.count()` | Count all events |
| `.countDistinct(key)` | Count distinct values |
| `.sum(key)` | Sum a numeric key |
| `.avg(key)` | Average of a numeric key |
| `.min(key)` / `.max(key)` | Min / max of a numeric key |
| `.p50(key)` / `.p90(key)` / `.p95(key)` / `.p99(key)` | Percentiles |
| `.calculate(op, key?)` | Add any calculation |
| `.calculations(calcs)` | Set calculations directly |
| `.groupBy(key, opts?)` | Add a group-by clause |
| `.groupBys(groups)` | Set group-by clauses directly |
| `.build()` | Build the `TelemetryQuery` object |

### `ObservabilityError`

| Property | Type | Description |
|---|---|---|
| `code` | `ErrorCode` | `"auth"`, `"validation"`, `"rate_limit"`, `"server"`, `"unknown"` |
| `status` | `number` | HTTP status code |
| `body` | `string` | Response body |
| `retryAfterMs` | `number \| null` | Parsed retry-after (rate limit only) |

### Utilities

| Function | Description |
|---|---|
| `parseEvent(event)` | Parse a raw event into a `WorkerLogEntry` |
| `parseEvents(events)` | Parse an array of events |
| `dedup(logs)` | Deduplicate log entries by request ID |
| `parseDuration(str)` | Parse `"5m"`, `"1h"`, `"7d"` into milliseconds |

## License

MIT
