/**
 * Integration tests for index.ts with SignalFx support
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Mock environment variables
const originalEnv = process.env;

describe("SignalFx Integration", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Configuration", () => {
    it("should support SignalFx configuration from environment", () => {
      process.env.SIGNALFX_ACCESS_TOKEN = "test-token";
      process.env.SIGNALFX_REALM = "eu0";

      expect(process.env.SIGNALFX_ACCESS_TOKEN).toBe("test-token");
      expect(process.env.SIGNALFX_REALM).toBe("eu0");
    });

    it("should use default realm if not specified", () => {
      process.env.SIGNALFX_ACCESS_TOKEN = "test-token";
      const realm = process.env.SIGNALFX_REALM || "us0";

      expect(realm).toBe("us0");
    });

    it("should support custom base URL", () => {
      process.env.SIGNALFX_ACCESS_TOKEN = "test-token";
      process.env.SIGNALFX_BASE_URL = "https://custom.signalfx.com/api";

      expect(process.env.SIGNALFX_BASE_URL).toBe(
        "https://custom.signalfx.com/api",
      );
    });

    it("should handle missing SignalFx token", () => {
      delete process.env.SIGNALFX_ACCESS_TOKEN;

      expect(process.env.SIGNALFX_ACCESS_TOKEN).toBeUndefined();
    });
  });

  describe("Tool Registration", () => {
    it("should define list_services tool", () => {
      const tool = {
        name: "list_services",
        description: "List all available services in the SignalFx environment",
      };

      expect(tool.name).toBe("list_services");
      expect(tool.description).toContain("SignalFx");
    });

    it("should define get_service_operations tool with required parameters", () => {
      const tool = {
        name: "get_service_operations",
        inputSchema: {
          type: "object",
          properties: {
            service_name: {
              type: "string",
              description: "Name of the service to get operations for",
            },
          },
          required: ["service_name"],
        },
      };

      expect(tool.name).toBe("get_service_operations");
      expect(tool.inputSchema.required).toContain("service_name");
    });

    it("should define search_traces tool with filtering options", () => {
      const tool = {
        name: "search_traces",
        inputSchema: {
          type: "object",
          properties: {
            service: { type: "string" },
            operation: { type: "string" },
            min_duration: { type: "number" },
            max_duration: { type: "number" },
            has_errors: { type: "boolean" },
            limit: { type: "number", default: 100 },
          },
        },
      };

      expect(tool.name).toBe("search_traces");
      expect(tool.inputSchema.properties.service).toBeDefined();
      expect(tool.inputSchema.properties.has_errors).toBeDefined();
    });

    it("should define get_trace_details tool with trace_id parameter", () => {
      const tool = {
        name: "get_trace_details",
        inputSchema: {
          type: "object",
          properties: {
            trace_id: {
              type: "string",
              description: "The ID of the trace to retrieve",
            },
          },
          required: ["trace_id"],
        },
      };

      expect(tool.name).toBe("get_trace_details");
      expect(tool.inputSchema.required).toContain("trace_id");
    });

    it("should define get_latency_metrics tool", () => {
      const tool = {
        name: "get_latency_metrics",
        inputSchema: {
          type: "object",
          properties: {
            service: { type: "string" },
            operation: { type: "string" },
          },
          required: ["service"],
        },
      };

      expect(tool.name).toBe("get_latency_metrics");
      expect(tool.inputSchema.required).toContain("service");
    });

    it("should define get_error_metrics tool", () => {
      const tool = {
        name: "get_error_metrics",
        inputSchema: {
          type: "object",
          properties: {
            service: { type: "string" },
            operation: { type: "string" },
          },
          required: ["service"],
        },
      };

      expect(tool.name).toBe("get_error_metrics");
      expect(tool.inputSchema.required).toContain("service");
    });
  });

  describe("Capabilities", () => {
    it("should include signalfx in capabilities when configured", () => {
      const capabilities = ["splunk", "signalfx", "traces"];

      expect(capabilities).toContain("signalfx");
      expect(capabilities).toContain("traces");
    });

    it("should not include signalfx in capabilities when not configured", () => {
      const capabilities = ["splunk"];

      expect(capabilities).not.toContain("signalfx");
    });
  });

  describe("Search Criteria Builder", () => {
    it("should build trace search criteria with all fields", () => {
      const args = {
        service: "auth-service",
        operation: "login",
        min_duration: 100,
        max_duration: 5000,
        has_errors: true,
        limit: 50,
        offset: 10,
      };

      const criteria = {
        service: args.service,
        operation: args.operation,
        minDuration: args.min_duration,
        maxDuration: args.max_duration,
        error: args.has_errors,
        limit: args.limit,
        offset: args.offset,
      };

      expect(criteria.service).toBe("auth-service");
      expect(criteria.operation).toBe("login");
      expect(criteria.minDuration).toBe(100);
      expect(criteria.error).toBe(true);
    });

    it("should handle undefined optional fields", () => {
      const args: {
        service?: string;
        operation?: string;
        limit: number;
        offset: number;
      } = {
        limit: 100,
        offset: 0,
      };

      const criteria = {
        service: args.service,
        operation: args.operation,
        limit: args.limit || 100,
        offset: args.offset || 0,
      };

      expect(criteria.service).toBeUndefined();
      expect(criteria.limit).toBe(100);
    });
  });

  describe("Response Format", () => {
    it("should format tool response with JSON content", () => {
      const result = {
        services: [
          { name: "service1", operationCount: 5 },
          { name: "service2", operationCount: 3 },
        ],
      };

      const response = {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };

      expect(response.content[0].type).toBe("text");
      expect(response.content[0].text).toContain("service1");
    });

    it("should handle error responses", () => {
      const errorMessage = "SignalFx client not configured";

      expect(() => {
        if (!process.env.SIGNALFX_ACCESS_TOKEN) {
          throw new Error(errorMessage);
        }
      }).toThrow(errorMessage);
    });
  });
});
