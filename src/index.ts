#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv";
import { SignalFxClient } from "./signalFx-client.js";
import { SplunkClient } from "./splunk-client.js";
import type { SignalFxConfig, SplunkConfig } from "./types.js";

// Load environment variables
config();

const VERSION = "0.3.0";

// Get configuration from environment
const splunkConfig: SplunkConfig = {
  host: process.env.SPLUNK_HOST || "localhost",
  port: parseInt(process.env.SPLUNK_PORT || "8089", 10),
  username: process.env.SPLUNK_USERNAME,
  password: process.env.SPLUNK_PASSWORD,
  token: process.env.SPLUNK_TOKEN,
  scheme: process.env.SPLUNK_SCHEME || "https",
  verifySSL: process.env.VERIFY_SSL?.toLowerCase() !== "false",
};

// Get SignalFx configuration from environment
const signalFxConfig: SignalFxConfig | null = process.env.SIGNALFX_ACCESS_TOKEN
  ? {
      accessToken: process.env.SIGNALFX_ACCESS_TOKEN,
      realm: process.env.SIGNALFX_REALM || "us0",
      baseUrl: process.env.SIGNALFX_BASE_URL,
    }
  : null;

// Create Splunk client
const splunkClient = new SplunkClient(splunkConfig);

// Create SignalFx client if configured
const signalFxClient = signalFxConfig
  ? new SignalFxClient(signalFxConfig)
  : null;

// Define MCP tools
const tools: Tool[] = [
  {
    name: "search_splunk",
    description:
      "Execute a Splunk search query and return the results.\n\nArgs:\n    search_query: The search query to execute\n    earliest_time: Start time for the search (default: 24 hours ago)\n    latest_time: End time for the search (default: now)\n    max_results: Maximum number of results to return (default: 100)",
    inputSchema: {
      type: "object",
      properties: {
        search_query: {
          type: "string",
          description: "The Splunk search query to execute",
        },
        earliest_time: {
          type: "string",
          description: "Start time for the search (e.g., -24h, -7d)",
          default: "-24h",
        },
        latest_time: {
          type: "string",
          description: "End time for the search (e.g., now)",
          default: "now",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return",
          default: 100,
        },
      },
      required: ["search_query"],
    },
  },
  {
    name: "list_indexes",
    description: "Get a list of all available Splunk indexes.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_index_info",
    description: "Get metadata for a specific Splunk index.",
    inputSchema: {
      type: "object",
      properties: {
        index_name: {
          type: "string",
          description: "Name of the index to get metadata for",
        },
      },
      required: ["index_name"],
    },
  },
  {
    name: "list_saved_searches",
    description: "List all saved searches in Splunk.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "current_user",
    description:
      "Get information about the currently authenticated user including username, roles, and capabilities.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_users",
    description: "List all Splunk users (requires admin privileges).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_kvstore_collections",
    description:
      "List all KV store collections across apps with metadata including app, fields, and accelerated fields.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "health_check",
    description:
      "Get basic Splunk connection information and list available apps.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_indexes_and_sourcetypes",
    description:
      "Get a list of all indexes and their sourcetypes with event counts and time range information.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "ping",
    description:
      "Simple ping endpoint to check server availability and get basic server information.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "health",
    description:
      "Get basic Splunk connection information and list available apps (alias for health_check).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  // SignalFx Traces Tools
  {
    name: "list_services",
    description:
      "List all available services in the SignalFx environment with operation counts and error status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_service_operations",
    description: "Get operations available for a specific service in SignalFx.",
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
  },
  {
    name: "search_traces",
    description:
      "Search for traces in SignalFx based on service, operation, duration, errors, and other criteria.\n\nArgs:\n    service: Filter by service name (optional)\n    operation: Filter by operation name (optional)\n    min_duration: Minimum duration in milliseconds (optional)\n    max_duration: Maximum duration in milliseconds (optional)\n    has_errors: Filter for traces with errors (optional, true/false)\n    limit: Maximum number of traces to return (default: 100)",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "Service name to filter by",
        },
        operation: {
          type: "string",
          description: "Operation name to filter by",
        },
        min_duration: {
          type: "number",
          description: "Minimum duration in milliseconds",
        },
        max_duration: {
          type: "number",
          description: "Maximum duration in milliseconds",
        },
        has_errors: {
          type: "boolean",
          description: "Filter for traces with errors",
        },
        limit: {
          type: "number",
          description: "Maximum number of traces to return",
          default: 100,
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
          default: 0,
        },
      },
    },
  },
  {
    name: "get_trace_details",
    description:
      "Get detailed information about a specific trace including all spans, tags, and timing information.",
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
  },
  {
    name: "get_latency_metrics",
    description:
      "Get latency metrics (p50, p75, p90, p99, mean) for a service or operation.",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "Service name",
        },
        operation: {
          type: "string",
          description: "Operation name (optional)",
        },
      },
      required: ["service"],
    },
  },
  {
    name: "get_error_metrics",
    description:
      "Get error metrics including error count, error rate, and error types for a service or operation.",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "Service name",
        },
        operation: {
          type: "string",
          description: "Operation name (optional)",
        },
      },
      required: ["service"],
    },
  },
];

// Create MCP server using the high-level McpServer API
const mcpServer = new McpServer(
  {
    name: "splunk-mcp",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Register tools using the McpServer API
mcpServer.registerTool(
  "search_splunk",
  {
    description: tools[0].description,
  },
  async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
    const args =
      (extra as unknown as { arguments?: Record<string, unknown> }).arguments ||
      {};
    const results = await splunkClient.searchSplunk(
      args.search_query as string,
      (args.earliest_time as string) || "-24h",
      (args.latest_time as string) || "now",
      (args.max_results as number) || 100,
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  },
);

mcpServer.registerTool(
  "list_indexes",
  {
    description: tools[1].description,
  },
  async () => {
    const result = await splunkClient.listIndexes();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

mcpServer.registerTool(
  "get_index_info",
  {
    description: tools[2].description,
  },
  async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
    const args =
      (extra as unknown as { arguments?: Record<string, unknown> }).arguments ||
      {};
    const result = await splunkClient.getIndexInfo(args.index_name as string);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

mcpServer.registerTool(
  "list_saved_searches",
  {
    description: tools[3].description,
  },
  async () => {
    const result = await splunkClient.listSavedSearches();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

mcpServer.registerTool(
  "current_user",
  {
    description: tools[4].description,
  },
  async () => {
    const result = await splunkClient.getCurrentUser();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

mcpServer.registerTool(
  "list_users",
  {
    description: tools[5].description,
  },
  async () => {
    const result = await splunkClient.listUsers();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

mcpServer.registerTool(
  "list_kvstore_collections",
  {
    description: tools[6].description,
  },
  async () => {
    const result = await splunkClient.listKVStoreCollections();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

mcpServer.registerTool(
  "health_check",
  {
    description: tools[7].description,
  },
  async () => {
    const result = await splunkClient.healthCheck();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

mcpServer.registerTool(
  "get_indexes_and_sourcetypes",
  {
    description: tools[8].description,
  },
  async () => {
    const result = await splunkClient.getIndexesAndSourcetypes();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

mcpServer.registerTool(
  "ping",
  {
    description: tools[9].description,
  },
  async () => {
    const capabilities = ["splunk"];
    if (signalFxClient) {
      capabilities.push("signalfx", "traces");
    }
    const result = {
      status: "ok",
      server: "splunk-mcp",
      version: VERSION,
      timestamp: new Date().toISOString(),
      protocol: "mcp",
      capabilities,
    };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

mcpServer.registerTool(
  "health",
  {
    description: tools[10].description,
  },
  async () => {
    const result = await splunkClient.healthCheck();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

// Register SignalFx tools if client is configured
if (signalFxClient) {
  mcpServer.registerTool(
    "list_services",
    {
      description: tools[11].description,
    },
    async () => {
      if (!signalFxClient) {
        throw new Error("SignalFx client not configured");
      }
      const result = await signalFxClient.listServices();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "get_service_operations",
    {
      description: tools[12].description,
    },
    async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      if (!signalFxClient) {
        throw new Error("SignalFx client not configured");
      }
      const args =
        (extra as unknown as { arguments?: Record<string, unknown> })
          .arguments || {};
      const result = await signalFxClient.getServiceOperations(
        args.service_name as string,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "search_traces",
    {
      description: tools[13].description,
    },
    async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      if (!signalFxClient) {
        throw new Error("SignalFx client not configured");
      }
      const args =
        (extra as unknown as { arguments?: Record<string, unknown> })
          .arguments || {};

      const criteria = {
        service: args.service as string | undefined,
        operation: args.operation as string | undefined,
        minDuration: args.min_duration as number | undefined,
        maxDuration: args.max_duration as number | undefined,
        error: args.has_errors as boolean | undefined,
        limit: (args.limit as number) || 100,
        offset: (args.offset as number) || 0,
      };

      const result = await signalFxClient.searchTraces(criteria);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "get_trace_details",
    {
      description: tools[14].description,
    },
    async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      if (!signalFxClient) {
        throw new Error("SignalFx client not configured");
      }
      const args =
        (extra as unknown as { arguments?: Record<string, unknown> })
          .arguments || {};
      const result = await signalFxClient.getTraceDetails(
        args.trace_id as string,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "get_latency_metrics",
    {
      description: tools[15].description,
    },
    async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      if (!signalFxClient) {
        throw new Error("SignalFx client not configured");
      }
      const args =
        (extra as unknown as { arguments?: Record<string, unknown> })
          .arguments || {};
      const result = await signalFxClient.getLatencyMetrics(
        args.service as string,
        args.operation as string | undefined,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "get_error_metrics",
    {
      description: tools[16].description,
    },
    async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      if (!signalFxClient) {
        throw new Error("SignalFx client not configured");
      }
      const args =
        (extra as unknown as { arguments?: Record<string, unknown> })
          .arguments || {};
      const result = await signalFxClient.getErrorMetrics(
        args.service as string,
        args.operation as string | undefined,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  const signalFxStatus = signalFxClient ? "✅ enabled" : "❌ disabled";
  console.error("🚀 Splunk MCP server running on stdio");
  console.error(`   - Splunk: ✅ enabled`);
  console.error(`   - SignalFx Traces: ${signalFxStatus}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
