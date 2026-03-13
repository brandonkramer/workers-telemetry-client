import { describe, it, expect } from "vitest";
import { ObservabilityError, classifyError } from "../errors";

describe("ObservabilityError", () => {
  it("carries code, status, and body", () => {
    const err = new ObservabilityError("msg", "server", 500, "body");

    expect(err.message).toBe("msg");
    expect(err.code).toBe("server");
    expect(err.status).toBe(500);
    expect(err.body).toBe("body");
    expect(err.retryAfterMs).toBeNull();
    expect(err).toBeInstanceOf(Error);
  });
});

describe("classifyError", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [400, "validation"],
    [422, "validation"],
    [500, "server"],
    [502, "server"],
    [503, "server"],
    [404, "unknown"],
  ])("maps HTTP %i to code %s", (status, expectedCode) => {
    const err = classifyError(status, "", null);

    expect(err.code).toBe(expectedCode);
    expect(err.status).toBe(status);
  });

  it("parses retry-after header into retryAfterMs for 429", () => {
    const err = classifyError(429, "", "5");

    expect(err.code).toBe("rate_limit");
    expect(err.retryAfterMs).toBe(5000);
  });

  it("sets retryAfterMs to null when retry-after header is missing", () => {
    const err = classifyError(429, "", null);

    expect(err.retryAfterMs).toBeNull();
  });
});
