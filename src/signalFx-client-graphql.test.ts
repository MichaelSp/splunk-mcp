/**
 * Additional tests for SignalFx client GraphQL methods
 */

import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignalFxClient } from "./signalFx-client";
import type { SignalFxConfig } from "./signalFx-types";

// Mock axios module
vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

describe("SignalFxClient GraphQL Error Handling", () => {
  let client: SignalFxClient;
  const config: SignalFxConfig = {
    accessToken: "test-token-graphql",
    baseUrl: "https://sap.signalfx.com/api/v2/apm",
  };

  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);
    client = new SignalFxClient(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("searchTraces error scenarios", () => {
    it("should handle startAnalyticsSearch GraphQL errors", async () => {
      const criteria = {
        environment: "prod",
        service: "api-service",
      };

      // Mock GraphQL error response
      const errorResponse = {
        data: {
          data: null,
          errors: [{ message: "Invalid query parameters" }],
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(errorResponse);

      await expect(client.searchTraces(criteria)).rejects.toThrow(
        "GraphQL Error",
      );
    });

    it("should handle network errors in GraphQL call", async () => {
      const criteria = {
        environment: "prod",
        service: "api-service",
      };

      mockAxiosInstance.post.mockRejectedValueOnce(
        new Error("Network connection failed"),
      );

      await expect(client.searchTraces(criteria)).rejects.toThrow(
        "Network connection failed",
      );
    });

    it("should handle search timeout after max poll attempts", async () => {
      const criteria = {
        environment: "prod",
        service: "api-service",
      };

      const pollOptions = {
        maxPollAttempts: 2,
        pollIntervalMs: 10,
      };

      // Mock start search response
      const startResponse = {
        data: {
          data: {
            startAnalyticsSearch: "job-timeout-123",
          },
        },
      };

      // Mock poll response that never completes
      const pollResponse = {
        data: {
          data: {
            getAnalyticsSearch: JSON.stringify({
              jobId: "job-timeout-123",
              sections: [
                {
                  sectionType: "traceExamples",
                  isComplete: false, // Never completes
                  legacyTraceExamples: [],
                },
              ],
            }),
          },
        },
      };

      mockAxiosInstance.post
        .mockResolvedValueOnce(startResponse)
        .mockResolvedValue(pollResponse); // All subsequent calls return incomplete

      await expect(client.searchTraces(criteria, pollOptions)).rejects.toThrow(
        "timed out after 2 attempts",
      );
    });

    it("should handle invalid startAnalyticsSearch response format", async () => {
      const criteria = {
        environment: "prod",
        service: "api-service",
      };

      // Mock response with unexpected format
      const startResponse = {
        data: {
          data: {
            startAnalyticsSearch: { unexpected: "format" }, // Invalid format
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(startResponse);

      await expect(client.searchTraces(criteria)).rejects.toThrow(
        "Unexpected StartAnalyticsSearch response",
      );
    });
  });

  describe("getTraceDetails GraphQL error handling", () => {
    it("should handle GraphQL errors when fetching trace details", async () => {
      const traceId = "trace-error-123";

      const errorResponse = {
        data: {
          data: null,
          errors: [{ message: "Trace not found" }],
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(errorResponse);

      await expect(client.getTraceDetails(traceId)).rejects.toThrow(
        "GraphQL Error",
      );
    });

    it("should handle malformed trace data response", async () => {
      const traceId = "trace-malformed-123";

      const malformedResponse = {
        data: {
          data: {
            getTrace: "not a valid JSON string", // Invalid JSON
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(malformedResponse);

      await expect(client.getTraceDetails(traceId)).rejects.toThrow();
    });
  });

  describe("listEnvironments", () => {
    it("should list environments via GraphQL", async () => {
      const environmentsResponse = {
        data: {
          data: {
            tagValues: [
              { tags: [{ value: "production" }] },
              { tags: [{ value: "staging" }] },
            ],
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(environmentsResponse);

      const result = await client.listEnvironments();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("production");
      expect(result[1].name).toBe("staging");
    });

    it("should handle empty environments list", async () => {
      const emptyResponse = {
        data: {
          data: {
            tagValues: [],
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(emptyResponse);

      const result = await client.listEnvironments();

      expect(result).toHaveLength(0);
    });

    it("should handle GraphQL errors when listing environments", async () => {
      const errorResponse = {
        data: {
          data: null,
          errors: [{ message: "Query timeout" }],
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(errorResponse);

      await expect(client.listEnvironments()).rejects.toThrow("GraphQL Error");
    });
  });

  describe("listServices with GraphQL", () => {
    it("should list services via GraphQL for GraphQL-enabled instances", async () => {
      const servicesResponse = {
        data: {
          data: {
            getTagValueAutocomplete: {
              values: ["auth-service", "api-gateway", "payment-service"],
            },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(servicesResponse);

      const result = await client.listServices();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("auth-service");
      expect(result[1].name).toBe("api-gateway");
      expect(result[2].name).toBe("payment-service");
    });

    it("should list services with environment filter", async () => {
      const servicesResponse = {
        data: {
          data: {
            getTagValueAutocomplete: {
              values: ["prod-service-1", "prod-service-2"],
            },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(servicesResponse);

      const result = await client.listServices("production");

      expect(result).toHaveLength(2);
      expect(result[0].environment).toBe("production");
    });
  });
});
