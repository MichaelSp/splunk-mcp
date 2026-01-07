/**
 * SignalFx Traces API Client
 * Provides methods to interact with SignalFx traces API for distributed tracing
 */

import axios, { type AxiosInstance } from "axios";
import type {
    ErrorMetrics,
    LatencyMetrics,
    Operation,
    Service,
    SignalFxConfig,
    Trace,
    TraceSearchCriteria,
    TraceSearchResult,
} from "./signalFx-types.js";

export class SignalFxClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(config: SignalFxConfig) {
    if (!config.accessToken) {
      throw new Error("SignalFx access token is required");
    }

    // Store config for potential future use (e.g., re-initialization)
    void config;

    // Determine realm and base URL
    const realm = config.realm || "us0";
    this.baseUrl =
      config.baseUrl || `https://api.${realm}.signalfx.com/v2/apm`;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "X-SF-Token": config.accessToken,
        "Content-Type": "application/json",
      },
    });
  }

  private log(
    emoji: string,
    message: string,
    level: "info" | "debug" | "error" = "info",
  ) {
    const timestamp = new Date().toISOString();
    console[level === "error" ? "error" : "log"](
      `${timestamp} - ${emoji} ${message}`,
    );
  }

  /**
   * List all services available in the environment
   */
  async listServices(): Promise<Service[]> {
    try {
      this.log("🔍", "Fetching list of services from SignalFx");

      const response = await this.client.get("/services");

      const services: Service[] = (response.data.services || []).map(
        (service: Record<string, unknown>) => ({
          name: service.name as string,
          operationCount: (service.operationCount as number) || 0,
          hasErrors: (service.hasErrors as boolean) || false,
          lastSeen: (service.lastSeen as number) || Date.now(),
        }),
      );

      this.log("✅", `Found ${services.length} services`);
      return services;
    } catch (error) {
      this.log(
        "❌",
        `Error fetching services: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * Get operations for a specific service
   */
  async getServiceOperations(serviceName: string): Promise<Operation[]> {
    if (!serviceName) {
      throw new Error("Service name is required");
    }

    try {
      this.log(
        "🔍",
        `Fetching operations for service: ${serviceName}`,
      );

      const response = await this.client.get(`/services/${serviceName}/operations`);

      const operations: Operation[] = (response.data.operations || []).map(
        (op: Record<string, unknown>) => ({
          name: op.name as string,
          serviceName,
          spanKind: op.spanKind as string | undefined,
          tags: op.tags as Record<string, unknown> | undefined,
        }),
      );

      this.log("✅", `Found ${operations.length} operations for ${serviceName}`);
      return operations;
    } catch (error) {
      this.log(
        "❌",
        `Error fetching operations: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * Search traces based on criteria
   */
  async searchTraces(criteria: TraceSearchCriteria): Promise<TraceSearchResult> {
    try {
      const query = this.buildTraceQuery(criteria);
      this.log("🔍", `Searching traces with query: ${JSON.stringify(criteria)}`);

      const response = await this.client.post("/traces/search", query);

      const traces: Trace[] = (response.data.traces || []).map(
        (trace: Record<string, unknown>) => this.parseTrace(trace),
      );

      const result: TraceSearchResult = {
        traces,
        totalCount: (response.data.totalCount as number) || traces.length,
        limit: criteria.limit || 100,
        offset: criteria.offset || 0,
      };

      this.log("✅", `Found ${traces.length} traces`);
      return result;
    } catch (error) {
      this.log(
        "❌",
        `Error searching traces: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * Get detailed information about a specific trace
   */
  async getTraceDetails(traceId: string): Promise<Trace> {
    if (!traceId) {
      throw new Error("Trace ID is required");
    }

    try {
      this.log("🔍", `Fetching details for trace: ${traceId}`);

      const response = await this.client.get(`/traces/${traceId}`);
      const trace = this.parseTrace(response.data);

      this.log("✅", `Retrieved trace with ${trace.spans.length} spans`);
      return trace;
    } catch (error) {
      this.log(
        "❌",
        `Error fetching trace details: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * Get latency metrics for a service/operation
   */
  async getLatencyMetrics(
    service: string,
    operation?: string,
  ): Promise<LatencyMetrics> {
    if (!service) {
      throw new Error("Service name is required");
    }

    try {
      const path = operation
        ? `/services/${service}/operations/${operation}/latency`
        : `/services/${service}/latency`;

      this.log("📊", `Fetching latency metrics for ${service}${operation ? `/${operation}` : ""}`);

      const response = await this.client.get(path);

      const metrics: LatencyMetrics = {
        service,
        operation,
        p50: (response.data.p50 as number) || 0,
        p75: (response.data.p75 as number) || 0,
        p90: (response.data.p90 as number) || 0,
        p99: (response.data.p99 as number) || 0,
        mean: (response.data.mean as number) || 0,
        min: (response.data.min as number) || 0,
        max: (response.data.max as number) || 0,
        sampleCount: (response.data.sampleCount as number) || 0,
      };

      this.log("✅", `Retrieved latency metrics for ${service}`);
      return metrics;
    } catch (error) {
      this.log(
        "❌",
        `Error fetching latency metrics: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * Get error metrics for a service/operation
   */
  async getErrorMetrics(
    service: string,
    operation?: string | undefined,
  ): Promise<ErrorMetrics> {
    if (!service) {
      throw new Error("Service name is required");
    }

    try {
      const path = operation
        ? `/services/${service}/operations/${operation}/errors`
        : `/services/${service}/errors`;

      this.log("📊", `Fetching error metrics for ${service}${operation ? `/${operation}` : ""}`);

      const response = await this.client.get(path);

      const metrics: ErrorMetrics = {
        service,
        operation,
        errorCount: (response.data.errorCount as number) || 0,
        totalCount: (response.data.totalCount as number) || 0,
        errorRate: (response.data.errorRate as number) || 0,
        errorTypes: (response.data.errorTypes as Record<string, number>) || {},
      };

      this.log("✅", `Retrieved error metrics for ${service}`);
      return metrics;
    } catch (error) {
      this.log(
        "❌",
        `Error fetching error metrics: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * Build query object for trace search
   */
  private buildTraceQuery(criteria: TraceSearchCriteria): Record<string, unknown> {
    const query: Record<string, unknown> = {};

    if (criteria.service) {
      query.service = criteria.service;
    }

    if (criteria.operation) {
      query.operation = criteria.operation;
    }

    if (criteria.tags) {
      query.tags = criteria.tags;
    }

    if (criteria.minDuration !== undefined) {
      query.minDuration = criteria.minDuration;
    }

    if (criteria.maxDuration !== undefined) {
      query.maxDuration = criteria.maxDuration;
    }

    if (criteria.error !== undefined) {
      query.error = criteria.error;
    }

    if (criteria.startTime !== undefined) {
      query.startTime = criteria.startTime;
    }

    if (criteria.endTime !== undefined) {
      query.endTime = criteria.endTime;
    }

    query.limit = criteria.limit || 100;
    query.offset = criteria.offset || 0;

    return query;
  }

  /**
   * Parse trace data from API response
   */
  private parseTrace(traceData: Record<string, unknown>): Trace {
    const spans = (traceData.spans as Array<Record<string, unknown>> || []).map(
      (span) => {
        const logs = span.logs as Array<Record<string, unknown>> | undefined;
        return {
          spanId: span.spanId as string,
          traceId: span.traceId as string,
          parentSpanId: span.parentSpanId as string | undefined,
          operationName: span.operationName as string,
          serviceName: span.serviceName as string,
          startTime: (span.startTime as number) || 0,
          duration: (span.duration as number) || 0,
          tags: (span.tags as Record<string, string | number | boolean>) || {},
          logs: logs?.map((log) => ({
            timestamp: (log.timestamp as number) || 0,
            fields: (log.fields as Record<string, unknown>) || {},
          })),
          status: (span.status as "ok" | "error" | "unset") || "unset",
          errorMessage: span.errorMessage as string | undefined,
        };
      },
    );

    const services = Array.from(new Set(spans.map((s) => s.serviceName)));
    const startTime = Math.min(...spans.map((s) => s.startTime), Infinity);
    const endTime = Math.max(
      ...spans.map((s) => s.startTime + s.duration),
      -Infinity,
    );

    return {
      traceId: (traceData.traceId as string) || "",
      spans,
      startTime,
      duration: endTime - startTime,
      services,
      operationName: spans[0]?.operationName,
    };
  }
}
