---
name: spec-driven-dev
description: Write a contract, tests, and implementation together so the code reads as its own specification. Use this skill whenever the user asks to implement a function, module, or feature and wants it test-driven or spec-first, or wants the code to be self-documenting. Trigger when the user says things like "write tests for this", "spec this out", "TDD this", "implement this with tests", "write this function spec-first", or "make this readable". Always use this skill when the user wants a full implementation cycle that starts from intent rather than code.
---

# Spec-Driven Development

This skill produces three artifacts in sequence for any function or set of functions:
1. **Contract** — the intent, written as a plain comment block above the function
2. **Tests** — named to express the contract, with real values as proof (Specification by Example)
3. **Implementation** — structured to mirror the contract, not to be clever

The goal: a developer reading the tests alone should understand what the function does, what it accepts, what it rejects, and why — without reading any other documentation.

---

## Step 1 — Understand the Scope

Before writing anything, establish:
- What is the function or module responsible for?
- What are the happy paths?
- What are the failure and edge cases?
- Does the function have meaningful caller context? (Multiple distinct callers with different motivations — if yes, use Job Stories format in Step 2b)

If the user provides a function signature, existing code, or a description — extract this from context. If it's ambiguous, ask one focused question before proceeding.

---

## Step 2 — Write the Contract

Write a plain comment block directly above the function. No actor format, no ceremony — just what the function does, what it accepts, and what it rejects.

**Format:**
```ts
/**
 * [functionName]
 *
 * [One sentence describing the core transformation or responsibility.]
 * [What inputs are valid / supported.]
 * [What inputs are rejected and why.]
 */
```

**Rules:**
- Write in plain declarative sentences — not "As a caller, I can..."
- One sentence per behavior — do not combine concerns
- State what is rejected and the condition, not the mechanism ("Invalid strings are rejected" not "throws an error")
- Order: core capability first, supported variants second, rejection cases last
- If writing contracts for multiple functions, one comment block per function

**Example:**
```ts
/**
 * parseDuration
 *
 * Converts a human-readable duration string into milliseconds.
 * Supports ms, s, m, h, d, w units and fractional values.
 * Rejects strings with unrecognized units or no numeric part.
 */
```

---

## Step 2b — Job Stories (use when caller context matters)

When a function has multiple distinct callers with different motivations, replace the plain contract with Job Stories. Job stories describe *when* the function is called and *what the caller needs* — not who the caller is.

**Format:**
```ts
/**
 * [functionName]
 *
 * When [situation], [what the caller can do / rely on].
 * When [failure situation], [what the caller can expect].
 */
```

**When to use this instead of the plain contract:**
- Middleware or auth functions called by multiple subsystems
- Queue processors where the trigger context affects expected behavior
- Any function where "why is this being called" changes what correct behavior looks like

**Example:**
```ts
/**
 * parseJwt
 *
 * When authenticating an inbound request, a caller can extract a verified payload without handling crypto directly.
 * When a token has expired, the caller receives a typed error it can act on rather than an opaque failure.
 * When a token is structurally invalid, the caller can distinguish a bad token from an expired one.
 */
```

---

## Step 3 — Write Tests (Vitest)

Write tests in a `describe` block named after the function. Each `it` name expresses one contract statement precisely. The body proves it with real values.

**Structure:**
```ts
import { describe, it, expect, vi } from "vitest"

describe("parseDuration", () => {
  it("converts minutes to milliseconds", () => {
    expect(parseDuration("5m")).toBe(300_000)
  })

  it("converts hours to milliseconds", () => {
    expect(parseDuration("2h")).toBe(7_200_000)
  })

  it("converts fractional values", () => {
    expect(parseDuration("1.5h")).toBe(5_400_000)
  })

  it("throws when the unit is not recognized", () => {
    expect(() => parseDuration("5x")).toThrow("Unrecognized unit: x")
  })

  it("throws when the string has no numeric part", () => {
    expect(() => parseDuration("m")).toThrow()
  })
})
```

**Rules:**
- One `it` block per contract statement — do not combine
- `it` name must read as a plain English sentence on its own — no "should", no "correctly"
- Arrange / Act / Assert with a blank line between each phase
- Use real, concrete values — not `someValue` or `mockInput`
- Use `vi.fn()` or `vi.mock()` for dependencies; never assert on internal calls that aren't part of the contract
- Keep each test self-contained — no shared mutable state between tests
- For async functions, always `await` and use `async () =>` in the `it` block
- For error cases, use `expect(...).rejects.toThrow(...)` or `expect(...).toThrow(...)` consistently
- Use `it.each` for unit-variant cases (e.g. one test covering all supported time units) rather than duplicating `it` blocks

**Naming conventions:**
| Contract statement | Test name pattern |
|---|---|
| Core capability | `"[does the thing]"` — e.g. `"converts minutes to milliseconds"` |
| Variant / supported input | `"[handles the variant]"` — e.g. `"converts fractional values"` |
| Rejection case | `"throws when [condition]"` or `"returns null when [condition]"` depending on the contract |

**it.each for variants:**
```ts
it.each([
  ["ms", 1,          1],
  ["s",  1,       1000],
  ["m",  1,      60_000],
  ["h",  1,   3_600_000],
  ["d",  1,  86_400_000],
])("converts %s to milliseconds", (unit, input, expected) => {
  expect(parseDuration(`${input}${unit}`)).toBe(expected)
})
```

---

## Step 4 — Write the Implementation

Write the implementation so its internal structure mirrors the contract.

**Rules:**
- Function name must match the contract — if the contract says "parse a duration string", the function is `parseDuration`, not `handleDurationInput`
- Extract named helper functions for each distinct contract concern — the names should echo the contract language
- No logic that isn't traceable to a contract statement — if you can't point to one, either the code shouldn't be there or the contract is incomplete
- Guards and rejection cases at the top; happy path flows naturally at the bottom
- Prefer named intermediate values over chained expressions when the name carries meaning

**Structure pattern:**
```ts
export function parseDuration(input: string): number {
  // Rejection cases first (maps to "rejects" contract statements)
  const match = input.match(/^(\d+\.?\d*)([a-z]+)$/)
  if (!match) throw new DurationError(`No numeric part found in: ${input}`)

  const [, raw, unit] = match
  const multiplier = UNIT_MULTIPLIERS[unit]
  if (!multiplier) throw new DurationError(`Unrecognized unit: ${unit}`)

  // Happy path (maps to core capability)
  return parseFloat(raw) * multiplier
}
```

---

## Ordering and Co-location

- Contract → tests → implementation, always in that order
- Present all three in one response for a single function
- For multiple functions, complete the full cycle per function before moving to the next unless they are tightly coupled
- Tests live in a `*.spec.ts` file co-located with the implementation unless specified otherwise

---

## Multiple Functions

Write a module-level contract block first, then per-function blocks inline:

```ts
/**
 * Module: RateLimit
 *
 * Tracks and enforces request rate limits against a sliding window.
 * Callers are never exposed to storage errors — limit checks always resolve.
 */

/**
 * increment
 *
 * Increments the request count for a key and returns the current window state.
 * ...
 */

/**
 * isExceeded
 *
 * Returns whether a key has surpassed its allowed request count in the current window.
 * ...
 */
```

Tests follow the same grouping — one top-level `describe` per function.

---

## What to Avoid

- Do not write "As a [actor]" stories for utility functions — the actor adds no information when everyone gets the same behavior
- Do not write test names with "should" — it hedges; state the behavior directly
- Do not use vague values in test bodies (`someToken`, `mockData`) — use real representative values
- Do not write implementation helpers that aren't motivated by a contract statement
- Do not add error handling that isn't in the contract — if it's worth handling, it's worth documenting
- Do not test implementation details — assert on outputs and thrown errors, not on which internal helpers were called