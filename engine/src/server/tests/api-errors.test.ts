import { describe, expect, it } from "vitest";
import { apiErrorSchema, type ApiError } from "@x-builder/shared";
import { buildServer } from "../server";

const parseApiError = (payload: string): ApiError => apiErrorSchema.parse(JSON.parse(payload));

const expectNoStackLeak = (value: unknown) => {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain('"stack"');
  expect(serialized).not.toMatch(/\bError:\s/);
  expect(serialized).not.toMatch(/\bat\s+\S+\s+\(/);
};

describe("engine API error normalization", () => {
  it("returns a normalized validation error for invalid idea generation input", async () => {
    const app = await buildServer();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/ideas/generate",
        payload: {
          idea: "",
        },
      });

      const error = parseApiError(response.body);

      expect(response.statusCode).toBe(400);
      expect(error).toMatchObject({
        code: "validation_failed",
        retryable: false,
        status: 400,
      });
      expect(error.fieldErrors?.idea).toEqual(expect.arrayContaining([expect.any(String)]));
      expectNoStackLeak(error);
    } finally {
      await app.close();
    }
  });

  it("returns a normalized not found error for unknown routes", async () => {
    const app = await buildServer();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/missing-route",
      });

      const error = parseApiError(response.body);

      expect(response.statusCode).toBe(404);
      expect(error).toMatchObject({
        code: "not_found",
        retryable: false,
        status: 404,
      });
      expectNoStackLeak(error);
    } finally {
      await app.close();
    }
  });

  it("returns a normalized internal error when a route handler throws unexpectedly", async () => {
    const app = await buildServer();

    app.get("/__test__/throws", async () => {
      throw new Error("Unexpected engine failure with sensitive internals");
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/__test__/throws",
      });

      const error = parseApiError(response.body);

      expect(response.statusCode).toBe(500);
      expect(error).toMatchObject({
        code: "internal_error",
        retryable: true,
        status: 500,
      });
      expect(JSON.stringify(error)).not.toContain("sensitive internals");
      expectNoStackLeak(error);
    } finally {
      await app.close();
    }
  });
});
