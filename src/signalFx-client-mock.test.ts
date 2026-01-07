/**
 * Mock-based integration tests for SignalFx client
 */

import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignalFxClient } from "./signalFx-client";
import type { SignalFxConfig } from "./signalFx-types";

// Mock axios module
vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

describe("SignalFxClient with Mocked API", () => {
  let client: SignalFxClient;
  const config: SignalFxConfig = {
    accessToken: "test-token-123",
    realm: "us0",
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

  describe("listServices", () => {
    it("should successfully fetch and return services", async () => {
      const mockResponse = {
        data: {
          services: [
            {
              name: "auth-service",
              operationCount: 5,
              hasErrors: false,
              lastSeen: Date.now(),
            },
            {
              name: "payment-service",
              operationCount: 3,
              hasErrors: true,
              lastSeen: Date.now(),
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.listServices();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("auth-service");
      expect(result[1].name).toBe("payment-service");
      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/services");
    });

    it("should handle empty services list", async () => {
      const mockResponse = {
        data: {
          services: [],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.listServices();

      expect(result).toHaveLength(0);
    });

    it("should handle API errors", async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.listServices()).rejects.toThrow("Network error");
    });
  });

  describe("getServiceOperations", () => {
    it("should fetch operations for a service", async () => {
      const serviceName = "auth-service";
      const mockResponse = {
        data: {
          operations: [
            {
              name: "login",
              spanKind: "server",
            },
            {
              name: "logout",
              spanKind: "server",
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getServiceOperations(serviceName);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("login");
      expect(result[0].serviceName).toBe(serviceName);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/services/${serviceName}/operations`,
      );
    });

    it("should handle errors for missing service", async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(
        new Error("Service not found"),
      );

      await expect(
        client.getServiceOperations("nonexistent"),
      ).rejects.toThrow();
    });
  });

  describe("searchTraces", () => {
    it("should search traces with full criteria", async () => {
      const criteria = {
        service: "auth-service",
        operation: "login",
        minDuration: 100,
        maxDuration: 5000,
        error: false,
        limit: 50,
        offset: 10,
      };

      const mockResponse = {
        data: {
          traces: [
            {
              traceId: "trace-123",
              spans: [
                {
                  spanId: "span-1",
                  traceId: "trace-123",
                  operationName: "login",
                  serviceName: "auth-service",
                  startTime: 1000000,
                  duration: 100,
                  tags: { "http.status_code": 200 },
                  status: "ok",
                },
              ],
            },
          ],
          totalCount: 1,
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

      const result = await client.searchTraces(criteria);

      expect(result.traces).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.limit).toBe(50);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        "/traces/search",
        expect.objectContaining({
          service: "auth-service",
          operation: "login",
        }),
      );
    });

    it("should search traces with minimal criteria", async () => {
      const criteria = {
        service: "api-gateway",
      };

      const mockResponse = {
        data: {
          traces: [],
          totalCount: 0,
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

      const result = await client.searchTraces(criteria);

      expect(result.traces).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });
  });

  describe("getTraceDetails", () => {
    it("should fetch detailed trace information", async () => {
      const traceId = "trace-456";
      const mockResponse = {
        data: {
          traceId,
          spans: [
            {
              spanId: "span-1",
              traceId,
              operationName: "http.request",
              serviceName: "api-gateway",
              startTime: 1000000,
              duration: 150,
              tags: {
                "http.url": "https://api.example.com/users",
                "http.method": "GET",
              },
              status: "ok",
            },
            {
              spanId: "span-2",
              traceId,
              parentSpanId: "span-1",
              operationName: "db.query",
              serviceName: "user-service",
              startTime: 1000010,
              duration: 50,
              tags: {
                "db.type": "postgresql",
              },
              logs: [
                {
                  timestamp: 1000020,
                  fields: { event: "query_start" },
                },
              ],
              status: "ok",
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getTraceDetails(traceId);

      expect(result.traceId).toBe(traceId);
      expect(result.spans).toHaveLength(2);
      expect(result.services).toContain("api-gateway");
      expect(result.services).toContain("user-service");
      expect(result.spans[1].logs).toHaveLength(1);
      expect(result.spans[1].logs?.[0].timestamp).toBe(1000020);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(`/traces/${traceId}`);
    });

    it("should handle trace with error", async () => {
      const traceId = "trace-error-001";
      const mockResponse = {
        data: {
          traceId,
          spans: [
            {
              spanId: "span-error",
              traceId,
              operationName: "payment.process",
              serviceName: "payment-service",
              startTime: 1000000,
              duration: 200,
              tags: {},
              status: "error",
              errorMessage: "Insufficient funds",
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getTraceDetails(traceId);

      expect(result.spans[0].status).toBe("error");
      expect(result.spans[0].errorMessage).toBe("Insufficient funds");
    });
  });

  describe("getLatencyMetrics", () => {
    it("should fetch latency metrics for a service", async () => {
      const serviceName = "api-gateway";
      const mockResponse = {
        data: {
          p50: 45,
          p75: 120,
          p90: 350,
          p99: 1200,
          mean: 200,
          min: 5,
          max: 5000,
          sampleCount: 10000,
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getLatencyMetrics(serviceName);

      expect(result.service).toBe(serviceName);
      expect(result.p50).toBe(45);
      expect(result.p99).toBe(1200);
      expect(result.sampleCount).toBe(10000);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/services/${serviceName}/latency`,
      );
    });

    it("should fetch latency metrics for operation", async () => {
      const serviceName = "api-gateway";
      const operation = "GET /users";
      const mockResponse = {
        data: {
          p50: 30,
          p75: 90,
          p90: 250,
          p99: 800,
          mean: 150,
          min: 2,
          max: 2000,
          sampleCount: 5000,
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getLatencyMetrics(serviceName, operation);

      expect(result.service).toBe(serviceName);
      expect(result.operation).toBe(operation);
      expect(result.p50).toBe(30);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/services/${serviceName}/operations/${operation}/latency`,
      );
    });
  });

  describe("getErrorMetrics", () => {
    it("should fetch error metrics for a service", async () => {
      const serviceName = "payment-service";
      const mockResponse = {
        data: {
          errorCount: 50,
          totalCount: 5000,
          errorRate: 0.01,
          errorTypes: {
            INSUFFICIENT_FUNDS: 30,
            NETWORK_TIMEOUT: 15,
            INVALID_CARD: 5,
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getErrorMetrics(serviceName);

      expect(result.service).toBe(serviceName);
      expect(result.errorCount).toBe(50);
      expect(result.errorRate).toBe(0.01);
      expect(result.errorTypes.INSUFFICIENT_FUNDS).toBe(30);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/services/${serviceName}/errors`,
      );
    });

    it("should fetch error metrics for operation", async () => {
      const serviceName = "payment-service";
      const operation = "process_payment";
      const mockResponse = {
        data: {
          errorCount: 25,
          totalCount: 2500,
          errorRate: 0.01,
          errorTypes: {
            INSUFFICIENT_FUNDS: 20,
            NETWORK_TIMEOUT: 5,
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getErrorMetrics(serviceName, operation);

      expect(result.service).toBe(serviceName);
      expect(result.operation).toBe(operation);
      expect(result.errorCount).toBe(25);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/services/${serviceName}/operations/${operation}/errors`,
      );
    });
  });
});
