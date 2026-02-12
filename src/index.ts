#!/usr/bin/env node

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv";
import type { Express } from "express";
import { z } from "zod";
import {
  httpServerShutdown,
  mcpDeleteHandler,
  mcpGetHandler,
  mcpPostHandler,
} from "./server.js";
import { SignalFxClient } from "./signalFx-client.js";
import { SplunkClient } from "./splunk-client.js";
import type { SignalFxConfig, SplunkConfig } from "./types.js";

// Load environment variables
config();

const VERSION = "0.3.0";
const MCP_PORT = parseInt(process.env.MCP_PORT || "3000", 10);

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

// Helper function to format tool responses as JSON
function jsonResponse(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

// Helper to extract arguments from MCP request (for tools without Zod schema)
function getArgs(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
) {
  const extra_obj = extra as unknown as Record<string, unknown>;
  let args: Record<string, unknown> = {};

  if (extra_obj.requestInfo) {
    const info = extra_obj.requestInfo as Record<string, unknown>;
    if (info.params && typeof info.params === "object") {
      const params = info.params as Record<string, unknown>;
      if (params.arguments) {
        args = params.arguments as Record<string, unknown>;
      }
    }
    if (!Object.keys(args).length && info.arguments) {
      args = info.arguments as Record<string, unknown>;
    }
  }

  return args;
}

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

// ============================================================================
// Splunk Tools
// ============================================================================

mcpServer.registerTool(
  "search_splunk",
  {
    description: "Execute a Splunk search query and return results.",
  },
  async (extra) => {
    const args = getArgs(extra);
    return jsonResponse(
      await splunkClient.searchSplunk(
        args.search_query as string,
        (args.earliest_time as string) || "-24h",
        (args.latest_time as string) || "now",
        (args.max_results as number) || 100,
      ),
    );
  },
);

mcpServer.registerTool(
  "list_indexes",
  { description: "Get a list of all available Splunk indexes." },
  async () => jsonResponse(await splunkClient.listIndexes()),
);

mcpServer.registerTool(
  "get_index_info",
  { description: "Get metadata for a specific Splunk index." },
  async (extra) => {
    const args = getArgs(extra);
    return jsonResponse(
      await splunkClient.getIndexInfo(args.index_name as string),
    );
  },
);

mcpServer.registerTool(
  "list_saved_searches",
  { description: "List all saved searches in Splunk." },
  async () => jsonResponse(await splunkClient.listSavedSearches()),
);

mcpServer.registerTool(
  "current_user",
  {
    description:
      "Get information about the currently authenticated user including username, roles, and capabilities.",
  },
  async () => jsonResponse(await splunkClient.getCurrentUser()),
);

mcpServer.registerTool(
  "list_users",
  { description: "List all Splunk users (requires admin privileges)." },
  async () => jsonResponse(await splunkClient.listUsers()),
);

mcpServer.registerTool(
  "list_kvstore_collections",
  {
    description:
      "List all KV store collections across apps with metadata including app, fields, and accelerated fields.",
  },
  async () => jsonResponse(await splunkClient.listKVStoreCollections()),
);

mcpServer.registerTool(
  "health_check",
  {
    description:
      "Get basic Splunk connection information and list available apps.",
  },
  async () => jsonResponse(await splunkClient.healthCheck()),
);

mcpServer.registerTool(
  "get_indexes_and_sourcetypes",
  {
    description:
      "Get a list of all indexes and their sourcetypes with event counts and time range information.",
  },
  async () => jsonResponse(await splunkClient.getIndexesAndSourcetypes()),
);

mcpServer.registerTool(
  "ping",
  {
    description:
      "Simple ping endpoint to check server availability and get basic server information.",
  },
  async () => {
    const capabilities = ["splunk"];
    if (signalFxClient) {
      capabilities.push("signalfx", "traces");
    }
    return jsonResponse({
      status: "ok",
      server: "splunk-mcp",
      version: VERSION,
      timestamp: new Date().toISOString(),
      protocol: "mcp",
      capabilities,
    });
  },
);

mcpServer.registerTool(
  "health",
  {
    description:
      "Get basic Splunk connection information and list available apps (alias for health_check).",
  },
  async () => jsonResponse(await splunkClient.healthCheck()),
);

// ============================================================================
// SignalFx Traces Tools (optional - only registered if configured)
// ============================================================================

if (signalFxClient) {
  mcpServer.registerTool(
    "list_environments",
    {
      description:
        "List all available environments (e.g., dev, prod, staging) in the SignalFx instance. " +
        "Environments are typically tagged with 'sf_environment' and represent different deployment stages or regions.",
    },
    async () => jsonResponse(await signalFxClient.listEnvironments()),
  );

  mcpServer.registerTool(
    "list_services",
    {
      description:
        "List all available services in the SignalFx environment with operation counts and error status.\n\n" +
        "Args:\n" +
        "    environment: Optional environment name to filter services (e.g., 'prod', 'dev', 'staging'). " +
        "Use list_environments to see available environments.",
    },
    async (extra) => {
      const args = getArgs(extra);
      return jsonResponse(
        await signalFxClient.listServices(
          args.environment as string | undefined,
        ),
      );
    },
  );

  mcpServer.registerTool(
    "get_service_operations",
    {
      description:
        "Get operations available for a specific service in SignalFx.",
    },
    async (extra) => {
      const args = getArgs(extra);
      return jsonResponse(
        await signalFxClient.getServiceOperations(args.service_name as string),
      );
    },
  );

  mcpServer.registerTool(
    "search_traces",
    {
      description:
        "Search for traces in SignalFx. Automatically uses GraphQL Analytics API for GraphQL-enabled instances or REST API for standard instances.\n\n" +
        "Args:\n" +
        "    environment: Environment name to search in (REQUIRED - use list_environments to see available options)\n" +
        "    service: Filter by service name (optional)\n" +
        "    operation: Filter by operation name (optional)\n" +
        "    start_time: Start time in milliseconds (Unix timestamp, optional, default: 15 minutes ago)\n" +
        "    end_time: End time in milliseconds (Unix timestamp, optional, default: now)\n" +
        "    has_errors: Filter for traces with errors (optional, true/false)\n" +
        "    tags: Additional tag filters as key-value pairs (optional)\n" +
        "    limit: Maximum number of traces to return (default: 100)\n\n" +
        "Note: For GraphQL-enabled instances, uses the GraphQL analytics search API with automatic job polling.",
      inputSchema: {
        environment: z
          .string()
          .describe("Environment name (use list_environments to see options)"),
        service: z
          .string()
          .optional()
          .describe(
            "Filter by service name (use list_services to see options)",
          ),
        operation: z.string().optional().describe("Filter by operation name"),
        start_time: z
          .number()
          .optional()
          .describe("Start time in milliseconds (Unix timestamp)"),
        end_time: z
          .number()
          .optional()
          .describe("End time in milliseconds (Unix timestamp)"),
        min_duration: z
          .number()
          .optional()
          .describe("Minimum trace duration in milliseconds"),
        max_duration: z
          .number()
          .optional()
          .describe("Maximum trace duration in milliseconds"),
        has_errors: z
          .boolean()
          .optional()
          .describe("Filter for traces with errors"),
        tags: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe("Additional tag filters"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of traces to return"),
        offset: z.number().optional().describe("Pagination offset"),
        max_poll_attempts: z
          .number()
          .optional()
          .describe("Max poll attempts for async search (default: 60)"),
        poll_interval_ms: z
          .number()
          .optional()
          .describe("Poll interval in milliseconds (default: 1000)"),
      },
    },
    async (args, _extra) => {
      return jsonResponse(
        await signalFxClient.searchTraces(
          {
            environment: args.environment,
            service: args.service,
            operation: args.operation,
            startTime: args.start_time,
            endTime: args.end_time,
            minDuration: args.min_duration,
            maxDuration: args.max_duration,
            error: args.has_errors,
            tags: args.tags as
              | Record<string, string | number | boolean>
              | undefined,
            limit: args.limit || 100,
            offset: args.offset || 0,
          },
          {
            maxPollAttempts: args.max_poll_attempts,
            pollIntervalMs: args.poll_interval_ms,
          },
        ),
      );
    },
  );

  mcpServer.registerTool(
    "list_trace_tag_names",
    {
      description:
        "List available tag names that can be used to filter traces. " +
        "Returns indexed and unindexed tag names available in the specified time range.\n\n" +
        "Args:\n" +
        "    start_time: Start time in milliseconds (Unix timestamp, optional, default: 15 minutes ago)\n" +
        "    end_time: End time in milliseconds (Unix timestamp, optional, default: now)\n" +
        "    tag_name_prefix: Filter tag names by prefix (optional)\n" +
        "    limit: Maximum number of results (default: 50)",
    },
    async (extra) => {
      const args = getArgs(extra);
      const now = Date.now();
      const startTime = (args.start_time as number) || now - 15 * 60 * 1000;
      const endTime = (args.end_time as number) || now;

      return jsonResponse(
        await signalFxClient.getTagNameAutocomplete(
          { gte: startTime, lte: endTime },
          (args.tag_name_prefix as string) || "",
          (args.limit as number) || 50,
        ),
      );
    },
  );

  mcpServer.registerTool(
    "list_trace_tag_values",
    {
      description:
        "List available values for a specific tag name. Useful for discovering service names, " +
        "operations, environments, and other tag values.\n\n" +
        "Args:\n" +
        "    tag_name: The tag name to get values for (required, e.g., 'sf_service', 'sf_environment')\n" +
        "    start_time: Start time in milliseconds (Unix timestamp, optional, default: 15 minutes ago)\n" +
        "    end_time: End time in milliseconds (Unix timestamp, optional, default: now)\n" +
        "    tag_value_prefix: Filter values by prefix (optional)\n" +
        "    limit: Maximum number of results (default: 50)",
    },
    async (extra) => {
      const args = getArgs(extra);
      const tagName = args.tag_name as string;

      if (!tagName) {
        throw new Error("tag_name is required");
      }

      const now = Date.now();
      const startTime = (args.start_time as number) || now - 15 * 60 * 1000;
      const endTime = (args.end_time as number) || now;

      return jsonResponse(
        await signalFxClient.getTagValueAutocomplete(
          tagName,
          { gte: startTime, lte: endTime },
          (args.tag_value_prefix as string) || "",
          [],
          (args.limit as number) || 50,
        ),
      );
    },
  );

  mcpServer.registerTool(
    "get_trace_details",
    {
      description:
        "Get detailed information about a specific trace including all spans, tags, and timing information.\n\n" +
        "Args:\n" +
        "    trace_id: The trace ID to fetch details for (required)\n" +
        "    environment: The environment name (optional, used for GraphQL instances)",
      inputSchema: {
        trace_id: z.string().describe("The trace ID to fetch details for"),
        environment: z
          .string()
          .optional()
          .describe("The environment name for filtering"),
      },
    },
    async (args, _extra) => {
      return jsonResponse(
        await signalFxClient.getTraceDetails(args.trace_id, args.environment),
      );
    },
  );

  mcpServer.registerTool(
    "get_latency_metrics",
    {
      description:
        "Get latency metrics (p50, p75, p90, p99, mean) for a service or operation.",
    },
    async (extra) => {
      const args = getArgs(extra);
      return jsonResponse(
        await signalFxClient.getLatencyMetrics(
          args.service as string,
          args.operation as string | undefined,
        ),
      );
    },
  );

  mcpServer.registerTool(
    "get_error_metrics",
    {
      description:
        "Get error metrics including error count, error rate, and error types for a service or operation.",
    },
    async (extra) => {
      const args = getArgs(extra);
      return jsonResponse(
        await signalFxClient.getErrorMetrics(
          args.service as string,
          args.operation as string | undefined,
        ),
      );
    },
  );
}

// Start the server
async function main() {
  const args = process.argv.slice(2);
  const modeFromArg = args.find((a) => a.startsWith("--mode="))?.split("=")[1];
  const mode =
    modeFromArg ?? (args.includes("--streamable") ? "streamable" : "stdio");

  const signalFxStatus = signalFxClient ? "✅ enabled" : "❌ disabled";

  let transport: Transport;
  let app: Express | undefined;
  if (mode === "streamable") {
    app = createMcpExpressApp();
    app.post("/mcp", await mcpPostHandler(mcpServer));
    app.get("/mcp", mcpGetHandler);
    app.delete("/mcp", mcpDeleteHandler);
    console.error(
      `🚀 Splunk MCP server running on ${mode} on localhost:${MCP_PORT}`,
    );
    console.error(`   - Splunk: ✅ enabled`);
    console.error(`   - SignalFx Traces: ${signalFxStatus}`);
    app.listen(MCP_PORT, (error: Error | undefined) => {
      if (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
      }
      console.log(`MCP Streamable HTTP Server listening on port ${MCP_PORT}`);
    });
    // Handle server shutdown
    process.on("SIGINT", async () => {
      console.log("Shutting down server...");

      await httpServerShutdown();
      console.log("Server shutdown complete");
      process.exit(0);
    });
  } else {
    transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error(`🚀 Splunk MCP server running on ${mode}`);
    console.error(`   - Splunk: ✅ enabled`);
    console.error(`   - SignalFx Traces: ${signalFxStatus}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
