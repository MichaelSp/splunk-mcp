/**
 * SignalFx Traces API Types and Interfaces
 */

export interface SignalFxConfig {
  accessToken: string;
  realm?: string;
  baseUrl?: string;
}

/**
 * Trace Span - represents a single operation within a trace
 */
export interface TraceSpan {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  duration: number;
  tags: Record<string, string | number | boolean>;
  logs?: Array<{
    timestamp: number;
    fields: Record<string, unknown>;
  }>;
  status: "ok" | "error" | "unset";
  errorMessage?: string;
}

/**
 * Trace - complete request with all spans
 */
export interface Trace {
  traceId: string;
  spans: TraceSpan[];
  startTime: number;
  duration: number;
  services: string[];
  operationName?: string;
}

/**
 * Environment information
 */
export interface Environment {
  name: string;
  serviceCount?: number;
}

/**
 * Service information
 */
export interface Service {
  name: string;
  environment?: string;
  operationCount: number;
  hasErrors: boolean;
  lastSeen: number;
}

/**
 * Operation information
 */
export interface Operation {
  name: string;
  serviceName: string;
  spanKind?: string;
  tags?: Record<string, unknown>;
}

/**
 * Trace search filter criteria
 */
export interface TraceSearchCriteria {
  environment: string; // Required - specifies the environment to search
  service?: string;
  operation?: string;
  tags?: Record<string, string | number | boolean>;
  minDuration?: number;
  maxDuration?: number;
  error?: boolean;
  limit?: number;
  offset?: number;
  startTime?: number;
  endTime?: number;
}

/**
 * Polling options for async trace search jobs
 */
export interface TraceSearchPollOptions {
  maxPollAttempts?: number;
  pollIntervalMs?: number;
}

/**
 * Trace search results
 */
export interface TraceSearchResult {
  traces: Trace[];
  totalCount: number;
  limit: number;
  offset: number;
}

/**
 * Latency metrics for a service/operation
 */
export interface LatencyMetrics {
  service: string;
  operation?: string;
  p50: number;
  p75: number;
  p90: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  sampleCount: number;
}

/**
 * Error metrics
 */
export interface ErrorMetrics {
  service: string;
  operation?: string;
  errorCount: number;
  totalCount: number;
  errorRate: number;
  errorTypes: Record<string, number>;
}

/**
 * Service dependency information
 */
export interface ServiceDependency {
  parent: string;
  child: string;
  callCount: number;
  errorCount: number;
  latencyMetrics: LatencyMetrics;
}

/**
 * Trace summary for search results
 */
export interface TraceSummary {
  traceId: string;
  operation: string;
  serviceName: string;
  startTime: number;
  duration: number;
  spanCount: number;
  hasErrors: boolean;
  errorCount: number;
  criticalPath?: string[];
}

/**
 * GraphQL Analytics Search Parameters
 */
export interface AnalyticsSearchParameters {
  sharedParameters: {
    timeRangeMillis: {
      gte: number;
      lte: number;
    };
    filters: Array<{
      traceFilter: {
        tags: Array<{
          tag: string;
          operation: string;
          values: string[];
        }>;
      };
      spanFilters?: Array<{
        tags: Array<{
          tag: string;
          operation: string;
          values: string[];
        }>;
      }>;
      filterType: string;
    }>;
    samplingFactor: number;
  };
  sectionsParameters: Array<{
    sectionType: string;
    limit?: number;
  }>;
}

/**
 * GraphQL Analytics Search Job Response
 */
export interface AnalyticsSearchJob {
  jobId: string;
  sections: Array<{
    sectionType: string;
    isComplete: boolean;
    legacyTraceExamples?: Array<{
      traceId: string;
      initiatingOperation: string;
      initiatingService: string;
      startTimeMicros: number;
      durationMicros: number;
      serviceSpanCounts: Array<{
        service: string;
        spanCount: number;
        errors: Array<unknown>;
      }>;
      initiatingSpanWasError: boolean;
      hasCallGraph: boolean;
    }>;
    data?: Array<unknown>;
  }>;
}

/**
 * Tag Autocomplete Response
 */
export interface TagAutocompleteResponse {
  indexed: string[];
  unindexed: string[];
  impactedIndexed: string[];
  impactedUnindexed: string[];
}

/**
 * Tag Value Autocomplete Response
 */
export interface TagValueAutocompleteResponse {
  values: string[];
}
