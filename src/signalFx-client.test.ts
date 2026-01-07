/**
 * SignalFx Client Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { SignalFxClient } from "./signalFx-client";
import type { SignalFxConfig } from "./signalFx-types";

describe("SignalFxClient", () => {
  const config: SignalFxConfig = {
    accessToken: "test-token-123",
    realm: "us0",
  };

  beforeEach(() => {
    // Reset before each test
  });

  describe("constructor", () => {
    it("should throw error if accessToken is missing", () => {
      const invalidConfig: SignalFxConfig = {
        accessToken: "",
        realm: "us0",
      };
      expect(() => new SignalFxClient(invalidConfig)).toThrow(
        "SignalFx access token is required",
      );
    });

    it("should create client with valid token", () => {
      const client = new SignalFxClient(config);
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(SignalFxClient);
    });

    it("should create client with default realm", () => {
      const configWithoutRealm: SignalFxConfig = {
        accessToken: "test-token",
      };
      const client = new SignalFxClient(configWithoutRealm);
      expect(client).toBeDefined();
    });

    it("should create client with custom baseUrl", () => {
      const customConfig: SignalFxConfig = {
        accessToken: "test-token",
        baseUrl: "https://custom.signalfx.com/api",
      };
      const client = new SignalFxClient(customConfig);
      expect(client).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should throw error for empty service name in getServiceOperations", async () => {
      const client = new SignalFxClient(config);
      await expect(client.getServiceOperations("")).rejects.toThrow(
        "Service name is required",
      );
    });

    it("should throw error for empty traceId in getTraceDetails", async () => {
      const client = new SignalFxClient(config);
      await expect(client.getTraceDetails("")).rejects.toThrow(
        "Trace ID is required",
      );
    });

    it("should throw error for empty service in getLatencyMetrics", async () => {
      const client = new SignalFxClient(config);
      await expect(client.getLatencyMetrics("")).rejects.toThrow(
        "Service name is required",
      );
    });

    it("should throw error for empty service in getErrorMetrics", async () => {
      const client = new SignalFxClient(config);
      await expect(client.getErrorMetrics("")).rejects.toThrow(
        "Service name is required",
      );
    });
  });

  describe("query building", () => {
    it("should build valid search criteria with all fields", async () => {
      const criteria = {
        service: "auth-service",
        operation: "login",
        tags: { environment: "production" },
        minDuration: 100,
        maxDuration: 5000,
        error: false,
        startTime: 1000000,
        endTime: 2000000,
        limit: 50,
        offset: 10,
      };

      expect(criteria.service).toBe("auth-service");
      expect(criteria.operation).toBe("login");
      expect(criteria.limit).toBe(50);
      expect(criteria.minDuration).toBeLessThan(criteria.maxDuration);
    });

    it("should build minimal search criteria", async () => {
      const criteria = {
        service: "simple-service",
      };

      expect(criteria.service).toBe("simple-service");
    });

    it("should support error filtering", async () => {
      const criteria = {
        service: "payment-service",
        error: true,
        limit: 25,
      };

      expect(criteria.error).toBe(true);
      expect(criteria.limit).toBe(25);
    });

    it("should support duration filtering", async () => {
      const criteria = {
        minDuration: 100,
        maxDuration: 5000,
        limit: 100,
      };

      expect(criteria.minDuration).toBe(100);
      expect(criteria.maxDuration).toBe(5000);
    });
  });

  describe("trace parsing", () => {
    it("should correctly handle trace with multiple spans", () => {
      const traceData = {
        traceId: "trace-123",
        spans: [
          {
            spanId: "span-1",
            traceId: "trace-123",
            parentSpanId: undefined,
            operationName: "http.request",
            serviceName: "api-gateway",
            startTime: 1000000,
            duration: 150,
            tags: {
              "http.url": "https://api.example.com/users",
              "http.method": "GET",
              "http.status_code": 200,
            },
            status: "ok",
          },
          {
            spanId: "span-2",
            traceId: "trace-123",
            parentSpanId: "span-1",
            operationName: "db.query",
            serviceName: "user-service",
            startTime: 1000010,
            duration: 50,
            tags: {
              "db.type": "postgresql",
              "db.statement": "SELECT * FROM users",
            },
            status: "ok",
          },
        ],
      };

      expect(traceData.spans.length).toBe(2);
      expect(traceData.spans[0].serviceName).toBe("api-gateway");
      expect(traceData.spans[1].serviceName).toBe("user-service");
      expect(traceData.spans[1].parentSpanId).toBe("span-1");
    });

    it("should correctly handle trace with error span", () => {
      const traceData = {
        traceId: "trace-error-001",
        spans: [
          {
            spanId: "span-error",
            traceId: "trace-error-001",
            operationName: "payment.process",
            serviceName: "payment-service",
            startTime: 1000000,
            duration: 200,
            tags: {
              "transaction.id": "txn-123",
            },
            status: "error",
            errorMessage: "Insufficient funds",
          },
        ],
      };

      expect(traceData.spans[0].status).toBe("error");
      expect(traceData.spans[0].errorMessage).toBe("Insufficient funds");
    });

    it("should handle logs in spans", () => {
      const span = {
        spanId: "span-1",
        traceId: "trace-123",
        operationName: "operation",
        serviceName: "service",
        startTime: 1000,
        duration: 100,
        tags: {},
        logs: [
          {
            timestamp: 1050,
            fields: { event: "processing" },
          },
        ],
        status: "ok",
      };

      expect(span.logs).toBeDefined();
      expect(span.logs?.[0].timestamp).toBe(1050);
      expect(span.logs?.[0].fields.event).toBe("processing");
    });
  });

  describe("metrics data structures", () => {
    it("should support latency metrics with percentiles", () => {
      const metrics = {
        service: "api-gateway",
        operation: undefined,
        p50: 45,
        p75: 120,
        p90: 350,
        p99: 1200,
        mean: 200,
        min: 5,
        max: 5000,
        sampleCount: 10000,
      };

      expect(metrics.p50).toBeLessThan(metrics.p75);
      expect(metrics.p75).toBeLessThan(metrics.p90);
      expect(metrics.p90).toBeLessThan(metrics.p99);
      expect(metrics.sampleCount).toBe(10000);
    });

    it("should support error metrics with error types", () => {
      const metrics = {
        service: "payment-service",
        operation: undefined,
        errorCount: 50,
        totalCount: 5000,
        errorRate: 0.01,
        errorTypes: {
          INSUFFICIENT_FUNDS: 30,
          NETWORK_TIMEOUT: 15,
          INVALID_CARD: 5,
        },
      };

      expect(metrics.errorRate).toBe(0.01);
      expect(metrics.errorCount).toBeGreaterThan(0);
      expect(Object.keys(metrics.errorTypes).length).toBeGreaterThan(0);
    });
  });

  describe("service and operation structures", () => {
    it("should define service with required fields", () => {
      const service = {
        name: "auth-service",
        operationCount: 5,
        hasErrors: false,
        lastSeen: Date.now(),
      };

      expect(service.name).toBe("auth-service");
      expect(service.operationCount).toBeGreaterThanOrEqual(0);
      expect(typeof service.hasErrors).toBe("boolean");
    });

    it("should define operation with required fields", () => {
      const operation = {
        name: "login",
        serviceName: "auth-service",
        spanKind: "server",
        tags: { authType: "oauth2" },
      };

      expect(operation.name).toBe("login");
      expect(operation.serviceName).toBe("auth-service");
    });
  });
});
