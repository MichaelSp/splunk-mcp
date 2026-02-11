import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import type { Request as ExRequest, Response as ExResponse } from "express";
import { IncomingMessage } from "http";

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

export async function httpServerShutdown() {
  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transports[sessionId]!.close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
}

export async function mcpPostHandler(mcpServer: McpServer) {
  return async (req: ExRequest & IncomingMessage, res: ExResponse) => {
    const sessionId = req.get("mcp-session-id") as string | undefined;
    if (sessionId) {
      console.log(`Received MCP request for session: ${sessionId}`);
    } else {
      console.log("Request body:", req.body);
    }
    try {
      let transport: StreamableHTTPServerTransport;
      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore, // Enable resumability
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID when session is initialized
            // This avoids race conditions where requests might come in before the session is stored
            console.log(`Session initialized with ID: ${sessionId}`);
            transports[sessionId] = transport;
          },
        });

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(
              `Transport closed for session ${sid}, removing from transports map`
            );
            delete transports[sid];
          }
        };

        // Connect the transport to the MCP server BEFORE handling the request
        // so responses can flow back through the same transport
        await mcpServer.connect(transport);

        await transport.handleRequest(req, res, req.body);
        return; // Already handled
      } else {
        // Invalid request - no session ID or not initialization request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      // Handle the request with existing transport - no need to reconnect
      // The existing transport is already connected to the server
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  };
}

export async function mcpGetHandler(
  req: ExRequest,
  res: ExResponse
): Promise<void> {
  const sessionId = req.get("mcp-session-id") as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  // Check for Last-Event-ID header for resumability
  const lastEventId = req.get("last-event-id") as string | undefined;
  if (lastEventId) {
    console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
  } else {
    console.log(`Establishing new SSE stream for session ${sessionId}`);
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
}

// Handle DELETE requests for session termination (according to MCP spec)
export async function mcpDeleteHandler(req: ExRequest, res: ExResponse) {
  const sessionId = req.get("mcp-session-id") as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  console.log(`Received session termination request for session ${sessionId}`);

  try {
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling session termination:", error);
    if (!res.headersSent) {
      res.status(500).send("Error processing session termination");
    }
  }
}
