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

// Helper to extract arguments from MCP request
function getArgs(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
) {
  return (
    (extra as unknown as { arguments?: Record<string, unknown> }).arguments ||
    {}
  );
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
  }
);

// ============================================================================
// Splunk Tools
// ============================================================================

mcpServer.registerTool(
  "search_splunk",
  {
    description:
      "Execute a Splunk search query and return the results.\n\nArgs:\n    search_query: The search query to execute\n    earliest_time: Start time for the search (default: 24 hours ago)\n    latest_time: End time for the search (default: now)\n    max_results: Maximum number of results to return (default: 100)",
  },
  async (extra) => {
    const args = getArgs(extra);
    return jsonResponse(
      await splunkClient.searchSplunk(
        args.search_query as string,
        (args.earliest_time as string) || "-24h",
        (args.latest_time as string) || "now",
        (args.max_results as number) || 100
      )
    );
  }
);

mcpServer.registerTool(
  "list_indexes",
  { description: "Get a list of all available Splunk indexes." },
  async () => jsonResponse(await splunkClient.listIndexes())
);

mcpServer.registerTool(
  "get_index_info",
  { description: "Get metadata for a specific Splunk index." },
  async (extra) => {
    const args = getArgs(extra);
    return jsonResponse(
      await splunkClient.getIndexInfo(args.index_name as string)
    );
  }
);

mcpServer.registerTool(
  "list_saved_searches",
  { description: "List all saved searches in Splunk." },
  async () => jsonResponse(await splunkClient.listSavedSearches())
);

mcpServer.registerTool(
  "current_user",
  {
    description:
      "Get information about the currently authenticated user including username, roles, and capabilities.",
  },
  async () => jsonResponse(await splunkClient.getCurrentUser())
);

mcpServer.registerTool(
  "list_users",
  { description: "List all Splunk users (requires admin privileges)." },
  async () => jsonResponse(await splunkClient.listUsers())
);

mcpServer.registerTool(
  "list_kvstore_collections",
  {
    description:
      "List all KV store collections across apps with metadata including app, fields, and accelerated fields.",
  },
  async () => jsonResponse(await splunkClient.listKVStoreCollections())
);

mcpServer.registerTool(
  "health_check",
  {
    description:
      "Get basic Splunk connection information and list available apps.",
  },
  async () => jsonResponse(await splunkClient.healthCheck())
);

mcpServer.registerTool(
  "get_indexes_and_sourcetypes",
  {
    description:
      "Get a list of all indexes and their sourcetypes with event counts and time range information.",
  },
  async () => jsonResponse(await splunkClient.getIndexesAndSourcetypes())
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
  }
);

mcpServer.registerTool(
  "health",
  {
    description:
      "Get basic Splunk connection information and list available apps (alias for health_check).",
  },
  async () => jsonResponse(await splunkClient.healthCheck())
);

// ============================================================================
// SignalFx Traces Tools (optional - only registered if configured)
// ============================================================================

if (signalFxClient) {
  mcpServer.registerTool(
    "list_services",
    {
      description:
        "List all available services in the SignalFx environment with operation counts and error status.",
    },
    async () => jsonResponse(await signalFxClient.listServices())
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
        await signalFxClient.getServiceOperations(args.service_name as string)
      );
    }
  );

  mcpServer.registerTool(
    "search_traces",
    {
      description:
        "Search for traces in SignalFx based on service, operation, duration, errors, and other criteria.\n\nArgs:\n    service: Filter by service name (optional)\n    operation: Filter by operation name (optional)\n    min_duration: Minimum duration in milliseconds (optional)\n    max_duration: Maximum duration in milliseconds (optional)\n    has_errors: Filter for traces with errors (optional, true/false)\n    limit: Maximum number of traces to return (default: 100)",
    },
    async (extra) => {
      const args = getArgs(extra);
      return jsonResponse(
        await signalFxClient.searchTraces({
          service: args.service as string | undefined,
          operation: args.operation as string | undefined,
          minDuration: args.min_duration as number | undefined,
          maxDuration: args.max_duration as number | undefined,
          error: args.has_errors as boolean | undefined,
          limit: (args.limit as number) || 100,
          offset: (args.offset as number) || 0,
        })
      );
    }
  );

  mcpServer.registerTool(
    "get_trace_details",
    {
      description:
        "Get detailed information about a specific trace including all spans, tags, and timing information.",
    },
    async (extra) => {
      const args = getArgs(extra);
      return jsonResponse(
        await signalFxClient.getTraceDetails(args.trace_id as string)
      );
    }
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
          args.operation as string | undefined
        )
      );
    }
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
          args.operation as string | undefined
        )
      );
    }
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
  let app: Express | undefined = undefined;
  if (mode === "streamable") {
    app = createMcpExpressApp();
    app.post("/mcp", await mcpPostHandler(mcpServer));
    app.get("/mcp", mcpGetHandler);
    app.delete("/mcp", mcpDeleteHandler);
    console.error(
      `🚀 Splunk MCP server running on ${mode} on localhost:${MCP_PORT}`
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
