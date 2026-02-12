/**
 * SignalFx Traces API Client
 * Provides methods to interact with SignalFx traces API for distributed tracing
 */

import axios, { type AxiosInstance } from "axios";
import type {
  AnalyticsSearchJob,
  AnalyticsSearchParameters,
  Environment,
  ErrorMetrics,
  LatencyMetrics,
  Operation,
  Service,
  SignalFxConfig,
  TagAutocompleteResponse,
  TagValueAutocompleteResponse,
  Trace,
  TraceSearchCriteria,
  TraceSearchPollOptions,
  TraceSearchResult,
} from "./signalFx-types.js";

export class SignalFxClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(config: SignalFxConfig) {
    if (!config.accessToken) {
      throw new Error("SignalFx access token is required");
    }

    // Determine realm and base URL
    const realm = config.realm || "us0";
    this.baseUrl = config.baseUrl || `https://api.${realm}.signalfx.com/v2/apm`;

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
   * Execute a GraphQL query against the SignalFx APM GraphQL endpoint
   */
  private async executeGraphQL(
    operationName: string,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<unknown> {
    try {
      const response = await this.client.post(`/graphql?op=${operationName}`, {
        operationName,
        variables,
        query,
      });

      if (response.data.errors) {
        throw new Error(`GraphQL Error: ${response.data.errors[0].message}`);
      }

      return response.data.data;
    } catch (error) {
      // Log detailed error information
      if (error instanceof Error && "response" in error) {
        const axiosError = error as {
          response?: { status: number; data: unknown };
        };
        if (axiosError.response) {
          this.log(
            "❌",
            `GraphQL failed with ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data)}`,
            "error",
          );
        }
      }
      this.log(
        "❌",
        `GraphQL query failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * List all available environments in the SignalFx instance
   * @param lookbackMillis - Time range to look back in milliseconds (default: 8 days)
   * @returns Array of environment names
   */
  async listEnvironments(
    lookbackMillis = 8 * 24 * 60 * 60 * 1000,
  ): Promise<Environment[]> {
    try {
      this.log("🔍", "Fetching list of environments from SignalFx");

      const query = `
        query GetEnvironments($timeRange: TimeRangeInput) {
          tagValues(
            groupbys: {tagName: "sf_environment"}
            timeRange: $timeRange
          ) {
            tags {
              value
            }
          }
        }
      `;

      const result = (await this.executeGraphQL("GetEnvironments", query, {
        timeRange: { lookbackMillis },
      })) as { tagValues: Array<{ tags: Array<{ value: string }> }> };

      const environments: Environment[] = result.tagValues.map((breakdown) => ({
        name: breakdown.tags[0].value,
      }));

      this.log("✅", `Found ${environments.length} environments`);
      return environments;
    } catch (error) {
      this.log(
        "❌",
        `Failed to fetch environments: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * List all services available in the environment
   * Uses tag autocomplete API to discover services from the sf_service tag
   * @param environment - Optional environment name to filter services (uses sf_environment tag)
   * @param lookbackMillis - Time range to look back in milliseconds (default: 8 days)
   */
  async listServices(
    environment?: string,
    lookbackMillis = 8 * 24 * 60 * 60 * 1000,
  ): Promise<Service[]> {
    try {
      const envMsg = environment ? ` for environment: ${environment}` : "";
      this.log("🔍", `Fetching list of services from SignalFx${envMsg}`);

      const now = Date.now();
      const timeRange = {
        gte: now - lookbackMillis,
        lte: now,
      };

      // Build filters for environment if specified
      const indexedTagFilters = environment
        ? [{ tagName: "sf_environment", tagValues: [environment] }]
        : [];

      // Get service names from sf_service tag
      const result = await this.getTagValueAutocomplete(
        "sf_service",
        timeRange,
        "",
        indexedTagFilters,
        1000, // Get up to 1000 services
      );

      const services: Service[] = result.values.map((name) => ({
        name,
        environment,
        operationCount: 0,
        hasErrors: false,
        lastSeen: Date.now(),
      }));

      this.log("✅", `Found ${services.length} services${envMsg}`);
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
      this.log("🔍", `Fetching operations for service: ${serviceName}`);

      const response = await this.client.get(
        `/services/${serviceName}/operations`,
      );

      const operations: Operation[] = (response.data.operations || []).map(
        (op: Record<string, unknown>) => ({
          name: op.name as string,
          serviceName,
          spanKind: op.spanKind as string | undefined,
          tags: op.tags as Record<string, unknown> | undefined,
        }),
      );

      this.log(
        "✅",
        `Found ${operations.length} operations for ${serviceName}`,
      );
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
   * Uses GraphQL analytics search for distributed tracing
   */
  async searchTraces(
    criteria: TraceSearchCriteria,
    pollOptions: TraceSearchPollOptions = {},
  ): Promise<TraceSearchResult> {
    // Add environment as a tag filter
    const enrichedCriteria = {
      ...criteria,
      tags: {
        ...criteria.tags,
        sf_environment: criteria.environment,
      },
    };

    return this.searchTracesGraphQL(
      enrichedCriteria,
      pollOptions.maxPollAttempts,
      pollOptions.pollIntervalMs,
    );
  }

  /**
   * Get detailed information about a specific trace
   */
  async getTraceDetails(traceId: string, environment?: string): Promise<Trace> {
    if (!traceId) {
      throw new Error("Trace ID is required");
    }

    try {
      this.log("🔍", `Fetching details for trace: ${traceId}`);
      return this.getTraceDetailsGraphQL(traceId, environment);
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
   * Get trace details via GraphQL
   */
  private async getTraceDetailsGraphQL(
    traceId: string,
    _environment?: string,
  ): Promise<Trace> {
    try {
      const query = `
        query TraceFullDetailsLessValidation($id: ID!, $spanLimit: Float = 1000, $returnPartialTrace: Boolean = false, $returnInferredServices: Boolean = false) {
          trace: traceLessValidation(
            id: $id
            spanLimit: $spanLimit
            returnPartialTrace: $returnPartialTrace
            returnInferredServices: $returnInferredServices
          ) {
            traceID
            rootOperation
            duration
            startTime
            spans
            processes
            errors
            globalTags {
              key
              type
              value
            }
          }
        }
      `;

      const result = (await this.executeGraphQL(
        "TraceFullDetailsLessValidation",
        query,
        {
          id: traceId,
          spanLimit: 1000,
          returnPartialTrace: false,
          returnInferredServices: false,
        },
      )) as {
        trace: {
          traceID: string;
          rootOperation: string;
          duration: number;
          startTime: number;
          spans: Array<{
            traceID: string;
            spanID: string;
            serviceName: string;
            operationName: string;
            startTime: number;
            duration: number;
            references: Array<{
              refType: string;
              traceID: string;
              spanID: string;
            }>;
            tags: Array<{
              key: string;
              type: string;
              value: string;
            }>;
            logs?: Array<{
              timestamp: number;
              fields: Array<{
                key: string;
                type: string;
                value: string;
              }>;
            }>;
          }>;
          processes: Array<{
            id: string;
            serviceName: string;
            tags: Array<{
              key: string;
              type: string;
              value: string;
            }>;
          }>;
          errors: Array<unknown>;
          globalTags: Array<{
            key: string;
            type: string;
            value: string;
          }>;
        };
      };

      if (!result.trace) {
        throw new Error(`Trace ${traceId} not found`);
      }

      const traceData = result.trace;

      // Parse spans from GraphQL response
      const spans = traceData.spans.map((span) => {
        // Find parent span ID from references
        const parentRef = span.references.find(
          (ref) => ref.refType === "CHILD_OF",
        );
        const parentSpanId = parentRef?.spanID;

        // Convert tags array to object
        const tags: Record<string, string | number | boolean> = {};
        for (const tag of span.tags) {
          tags[tag.key] = tag.value;
        }

        // Parse logs
        const logs = span.logs?.map((log) => {
          const fields: Record<string, unknown> = {};
          for (const field of log.fields) {
            fields[field.key] = field.value;
          }
          return {
            timestamp: log.timestamp,
            fields,
          };
        });

        // Check if span has error
        const hasError =
          tags.error === "true" || tags["otel.status_code"] === "ERROR";

        return {
          spanId: span.spanID,
          traceId: span.traceID,
          parentSpanId,
          operationName: span.operationName,
          serviceName: span.serviceName,
          startTime: Math.floor(span.startTime / 1000), // Convert microseconds to milliseconds
          duration: Math.floor(span.duration / 1000), // Convert microseconds to milliseconds
          tags,
          logs,
          status: (hasError ? "error" : "ok") as "ok" | "error" | "unset",
          errorMessage: hasError
            ? String(tags["error.message"] || "")
            : undefined,
        };
      });

      // Extract unique services
      const services = Array.from(new Set(spans.map((s) => s.serviceName)));

      const trace: Trace = {
        traceId: traceData.traceID,
        spans,
        startTime: Math.floor(traceData.startTime / 1000), // Convert microseconds to milliseconds
        duration: Math.floor(traceData.duration / 1000), // Convert microseconds to milliseconds
        services,
        operationName: traceData.rootOperation,
      };

      this.log("✅", `Retrieved trace with ${trace.spans.length} spans`);
      return trace;
    } catch (error) {
      this.log(
        "❌",
        `Error fetching trace details via GraphQL: ${error instanceof Error ? error.message : String(error)}`,
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

      this.log(
        "📊",
        `Fetching latency metrics for ${service}${operation ? `/${operation}` : ""}`,
      );

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

      this.log(
        "📊",
        `Fetching error metrics for ${service}${operation ? `/${operation}` : ""}`,
      );

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
   * Start an analytics search job using GraphQL
   * This initiates an asynchronous trace search and returns a job ID
   */
  async startAnalyticsSearch(
    parameters: AnalyticsSearchParameters,
  ): Promise<string> {
    try {
      this.log("🔍", "Starting analytics search job");

      const query = `
        query StartAnalyticsSearch($parameters: JSON!) {
          startAnalyticsSearch(parameters: $parameters)
        }
      `;

      // Pass parameters as a JavaScript object - GraphQL transport handles JSON serialization
      const result = (await this.executeGraphQL("StartAnalyticsSearch", query, {
        parameters,
      })) as { startAnalyticsSearch: unknown };

      const startResponse = result.startAnalyticsSearch;
      let jobId: string;
      if (typeof startResponse === "string") {
        jobId = startResponse;
      } else if (
        startResponse &&
        typeof startResponse === "object" &&
        "jobId" in startResponse
      ) {
        jobId = String((startResponse as { jobId: unknown }).jobId);
      } else {
        throw new Error(
          `Unexpected StartAnalyticsSearch response: ${JSON.stringify(startResponse)}`,
        );
      }
      this.log("✅", `Analytics search job started: ${jobId}`);
      return jobId;
    } catch (error) {
      this.log(
        "❌",
        `Error starting analytics search: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * Get the results of an analytics search job
   * Poll this method until the job status is COMPLETE
   */
  async getAnalyticsSearch(jobId: string): Promise<AnalyticsSearchJob> {
    if (!jobId) {
      throw new Error("Job ID is required");
    }

    try {
      const query = `
        query GetAnalyticsSearch($jobId: ID!) {
          getAnalyticsSearch(jobId: $jobId)
        }
      `;

      const result = (await this.executeGraphQL("GetAnalyticsSearch", query, {
        jobId,
      })) as { getAnalyticsSearch: unknown };

      // Handle both string and object responses
      const rawResponse = result.getAnalyticsSearch;
      const parsed: AnalyticsSearchJob =
        typeof rawResponse === "string"
          ? (JSON.parse(rawResponse) as AnalyticsSearchJob)
          : (rawResponse as AnalyticsSearchJob);

      return parsed;
    } catch (error) {
      this.log(
        "❌",
        `Error getting analytics search results: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * Search traces using the GraphQL analytics search API
   * This method handles the async job pattern automatically
   * @param criteria - Search criteria
   * @param maxPollAttempts - Maximum number of poll attempts (default: 60)
   * @param pollIntervalMs - Interval between poll attempts in ms (default: 1000)
   */
  async searchTracesGraphQL(
    criteria: TraceSearchCriteria,
    maxPollAttempts = 60,
    pollIntervalMs = 1000,
  ): Promise<TraceSearchResult> {
    try {
      this.log(
        "🔍",
        `Searching traces with: service=${criteria.service}, operation=${criteria.operation}, limit=${criteria.limit || 100}`,
      );

      // Build analytics search parameters from criteria
      const now = Date.now();
      const startTime = criteria.startTime || now - 15 * 60 * 1000; // Default: 15 minutes ago
      const endTime = criteria.endTime || now;

      // Build trace-level tag filters (for tags that apply to entire trace, like environment)
      const traceFilterTags: Array<{
        tag: string;
        operation: string;
        values: string[];
      }> = [];

      // Build span-level tag filters (for tags that apply to individual spans, like service/operation)
      const spanFilterTags: Array<{
        tag: string;
        operation: string;
        values: string[];
      }> = [];

      if (criteria.service) {
        spanFilterTags.push({
          tag: "sf_service",
          operation: "IN",
          values: [criteria.service],
        });
      }

      if (criteria.operation) {
        spanFilterTags.push({
          tag: "sf_operation",
          operation: "IN",
          values: [criteria.operation],
        });
      }

      if (criteria.error !== undefined) {
        spanFilterTags.push({
          tag: "sf_error",
          operation: "IN",
          values: [criteria.error ? "true" : "false"],
        });
      }

      // Process custom tags - put environment at trace level, others at span level
      if (criteria.tags) {
        for (const [key, value] of Object.entries(criteria.tags)) {
          const tagFilter = {
            tag: key,
            operation: "IN",
            values: [String(value)],
          };

          if (key === "sf_environment") {
            traceFilterTags.push(tagFilter);
          } else {
            spanFilterTags.push(tagFilter);
          }
        }
      }

      // Build the analytics search parameters following the documented API structure
      const parameters: AnalyticsSearchParameters = {
        sharedParameters: {
          timeRangeMillis: {
            gte: startTime,
            lte: endTime,
          },
          filters: [
            {
              traceFilter: {
                tags: traceFilterTags,
              },
              spanFilters:
                spanFilterTags.length > 0
                  ? [
                      {
                        tags: spanFilterTags,
                      },
                    ]
                  : undefined,
              filterType: "traceFilter",
            },
          ],
          samplingFactor: 100,
        },
        sectionsParameters: [
          {
            sectionType: "traceExamples",
            limit: criteria.limit || 100,
          },
          {
            sectionType: "traceCountTimeBucketed",
          },
        ],
      };

      this.log("🔍", `Built parameters: ${JSON.stringify(parameters)}`);

      // Start the search job
      const jobId = await this.startAnalyticsSearch(parameters);

      // Poll for results
      let attempts = 0;
      while (attempts < maxPollAttempts) {
        attempts++;

        const job = await this.getAnalyticsSearch(jobId);

        // Check if all sections are complete
        const allComplete = job.sections.every((section) => section.isComplete);

        this.log(
          "🔍",
          `Analytics search progress: ${job.sections.filter((s) => s.isComplete).length}/${job.sections.length} sections complete (attempt ${attempts}/${maxPollAttempts})`,
        );

        if (allComplete) {
          // Extract trace examples from sections
          const traceExamplesSection = job.sections.find(
            (s) => s.sectionType === "traceExamples",
          );
          const traceExamples = traceExamplesSection?.legacyTraceExamples || [];

          this.log("✅", `Found ${traceExamples.length} traces`);

          return {
            traces: traceExamples.map((example) => ({
              traceId: example.traceId,
              spans: [],
              startTime: Math.floor(example.startTimeMicros / 1000),
              duration: Math.floor(example.durationMicros / 1000),
              services: [example.initiatingService],
              operationName: example.initiatingOperation,
            })),
            totalCount: traceExamples.length,
            limit: criteria.limit || 100,
            offset: criteria.offset || 0,
          };
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      throw new Error(
        `Analytics search job timed out after ${maxPollAttempts} attempts`,
      );
    } catch (error) {
      this.log(
        "❌",
        `Error searching traces via GraphQL: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * Get available tag names for autocomplete
   * @param timeRangeMillis - Time range for the query
   * @param tagNameInput - Prefix to filter tag names (optional)
   * @param queryLimit - Maximum number of results (default: 50)
   */
  async getTagNameAutocomplete(
    timeRangeMillis: { gte: number; lte: number },
    tagNameInput = "",
    queryLimit = 50,
  ): Promise<TagAutocompleteResponse> {
    try {
      this.log("🔍", "Fetching available tag names");

      const query = `
        query GetTagNameAutocomplete($time: AutocompleteTimeInput, $tagNameInput: String, $queryLimit: Int, $tagType: String) {
          getTagNameAutocomplete(
            time: $time
            tagNameInput: $tagNameInput
            queryLimit: $queryLimit
            tagType: $tagType
          ) {
            indexed
            unindexed
            impactedIndexed
            impactedUnindexed
            __typename
          }
        }
      `;

      const result = (await this.executeGraphQL(
        "GetTagNameAutocomplete",
        query,
        {
          time: timeRangeMillis,
          tagNameInput,
          queryLimit,
        },
      )) as { getTagNameAutocomplete: TagAutocompleteResponse };

      this.log(
        "✅",
        `Found ${result.getTagNameAutocomplete.indexed.length} indexed tags`,
      );
      return result.getTagNameAutocomplete;
    } catch (error) {
      this.log(
        "❌",
        `Error fetching tag names: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }

  /**
   * Get available values for a specific tag
   * @param tagName - The tag name to get values for
   * @param timeRangeMillis - Time range for the query
   * @param tagValueInput - Prefix to filter values (optional)
   * @param indexedTagFilters - Additional filters (optional)
   * @param queryLimit - Maximum number of results (default: 50)
   */
  async getTagValueAutocomplete(
    tagName: string,
    timeRangeMillis: { gte: number; lte: number },
    tagValueInput = "",
    indexedTagFilters: Array<unknown> = [],
    queryLimit = 50,
  ): Promise<TagValueAutocompleteResponse> {
    if (!tagName) {
      throw new Error("Tag name is required");
    }

    try {
      this.log("🔍", `Fetching values for tag: ${tagName}`);

      const query = `
        query GetTagValueAutocomplete($time: AutocompleteTimeInput, $tagName: String, $tagValueInput: String, $indexedTagFilters: [IndexedTagFiltersInput], $queryLimit: Int, $tagType: String) {
          getTagValueAutocomplete(
            time: $time
            tagName: $tagName
            tagValueInput: $tagValueInput
            indexedTagFilters: $indexedTagFilters
            queryLimit: $queryLimit
            tagType: $tagType
          ) {
            values
            __typename
          }
        }
      `;

      const result = (await this.executeGraphQL(
        "GetTagValueAutocomplete",
        query,
        {
          time: timeRangeMillis,
          tagName,
          tagValueInput,
          indexedTagFilters,
          queryLimit,
        },
      )) as { getTagValueAutocomplete: TagValueAutocompleteResponse };

      this.log(
        "✅",
        `Found ${result.getTagValueAutocomplete.values.length} values for ${tagName}`,
      );
      return result.getTagValueAutocomplete;
    } catch (error) {
      this.log(
        "❌",
        `Error fetching tag values: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }
}
