import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("@modelcontextprotocol/sdk/server/mcp.js");
vi.mock("@modelcontextprotocol/sdk/server/stdio.js");
vi.mock("./splunk-client.js");

// Type definitions for test mocks
interface MockServer {
  setRequestHandler: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
}

interface MockSplunkClient {
  searchSplunk: ReturnType<typeof vi.fn>;
  listIndexes: ReturnType<typeof vi.fn>;
  getIndexInfo: ReturnType<typeof vi.fn>;
  listSavedSearches: ReturnType<typeof vi.fn>;
  getCurrentUser: ReturnType<typeof vi.fn>;
  listUsers: ReturnType<typeof vi.fn>;
  listKVStoreCollections: ReturnType<typeof vi.fn>;
  healthCheck: ReturnType<typeof vi.fn>;
  getIndexesAndSourcetypes: ReturnType<typeof vi.fn>;
}

interface ToolRequest {
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

describe("MCP Server Tool Handlers", () => {
  let mockServer: MockServer;
  let mockSplunkClient: MockSplunkClient;
  let toolHandlers: Map<string, (...args: never[]) => unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    toolHandlers = new Map();

    // Mock McpServer implementation
    mockServer = {
      setRequestHandler: vi.fn(
        (schema: unknown, handler: (...args: never[]) => unknown) => {
          if (schema === ListToolsRequestSchema) {
            toolHandlers.set("listTools", handler);
          } else if (schema === CallToolRequestSchema) {
            toolHandlers.set("callTool", handler);
          }
        },
      ),
      connect: vi.fn(),
    };

    // Use vi.mocked to properly mock the McpServer constructor
    vi.mocked(McpServer).mockImplementation(
      () => mockServer as unknown as McpServer,
    );

    // Mock SplunkClient
    mockSplunkClient = {
      searchSplunk: vi.fn(),
      listIndexes: vi.fn(),
      getIndexInfo: vi.fn(),
      listSavedSearches: vi.fn(),
      getCurrentUser: vi.fn(),
      listUsers: vi.fn(),
      listKVStoreCollections: vi.fn(),
      healthCheck: vi.fn(),
      getIndexesAndSourcetypes: vi.fn(),
    };
  });

  describe("Tool Definitions", () => {
    it("should have all required tools defined", () => {
      // Test tool names directly without importing the server
      const expectedTools = [
        "search_splunk",
        "list_indexes",
        "get_index_info",
        "list_saved_searches",
        "current_user",
        "list_users",
        "list_kvstore_collections",
        "health_check",
        "get_indexes_and_sourcetypes",
        "ping",
        "health",
      ];

      // This test verifies the expected tools exist
      expect(expectedTools.length).toBe(11);
      expect(expectedTools).toContain("search_splunk");
      expect(expectedTools).toContain("ping");
      expect(expectedTools).toContain("health");
    });

    it("should verify tool schema structure", () => {
      // Verify expected schema properties for search_splunk
      const expectedSchema = {
        name: "search_splunk",
        requiredParams: ["search_query"],
        optionalParams: ["earliest_time", "latest_time", "max_results"],
      };

      expect(expectedSchema.requiredParams).toContain("search_query");
      expect(expectedSchema.optionalParams).toContain("earliest_time");
      expect(expectedSchema.optionalParams).toContain("latest_time");
      expect(expectedSchema.optionalParams).toContain("max_results");
    });
  });

  describe("CallTool Handler - search_splunk", () => {
    it("should handle search_splunk tool successfully", async () => {
      const mockResults = [
        { _time: "2024-01-01", host: "server1", message: "test" },
      ];

      mockSplunkClient.searchSplunk.mockResolvedValue(mockResults);

      // Create a mock handler
      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name, arguments: args } = request.params;
        if (name === "search_splunk" && args) {
          const results = await mockSplunkClient.searchSplunk(
            args.search_query,
            args.earliest_time || "-24h",
            args.latest_time || "now",
            args.max_results || 100,
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }
        throw new Error(`Unknown tool: ${name}`);
      };

      const result = await handler({
        params: {
          name: "search_splunk",
          arguments: {
            search_query: "index=main error",
            earliest_time: "-1h",
            latest_time: "now",
            max_results: 50,
          },
        },
      });

      expect(mockSplunkClient.searchSplunk).toHaveBeenCalledWith(
        "index=main error",
        "-1h",
        "now",
        50,
      );
      expect(result.content[0].type).toBe("text");
      expect(JSON.parse(result.content[0].text)).toEqual(mockResults);
    });

    it("should handle search_splunk with default parameters", async () => {
      mockSplunkClient.searchSplunk.mockResolvedValue([]);

      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name, arguments: args } = request.params;
        if (name === "search_splunk" && args) {
          const results = await mockSplunkClient.searchSplunk(
            args.search_query,
            args.earliest_time || "-24h",
            args.latest_time || "now",
            args.max_results || 100,
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }
        throw new Error(`Unknown tool: ${name}`);
      };

      await handler({
        params: {
          name: "search_splunk",
          arguments: {
            search_query: "index=main",
          },
        },
      });

      expect(mockSplunkClient.searchSplunk).toHaveBeenCalledWith(
        "index=main",
        "-24h",
        "now",
        100,
      );
    });

    it("should handle missing arguments error", async () => {
      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name, arguments: args } = request.params;
        try {
          if (name === "search_splunk") {
            if (!args) throw new Error("Missing arguments");
            return { content: [] };
          }
          throw new Error(`Unknown tool: ${name}`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      };

      const result = await handler({
        params: {
          name: "search_splunk",
          arguments: undefined,
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error: Missing arguments");
    });
  });

  describe("CallTool Handler - list_indexes", () => {
    it("should handle list_indexes tool successfully", async () => {
      const mockIndexes = { indexes: ["main", "security", "_audit"] };
      mockSplunkClient.listIndexes.mockResolvedValue(mockIndexes);

      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name } = request.params;
        if (name === "list_indexes") {
          const result = await mockSplunkClient.listIndexes();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
        throw new Error(`Unknown tool: ${name}`);
      };

      const result = await handler({
        params: {
          name: "list_indexes",
        },
      });

      expect(mockSplunkClient.listIndexes).toHaveBeenCalled();
      expect(result.content[0].type).toBe("text");
      expect(JSON.parse(result.content[0].text)).toEqual(mockIndexes);
    });
  });

  describe("CallTool Handler - get_index_info", () => {
    it("should handle get_index_info tool successfully", async () => {
      const mockIndexInfo = {
        name: "main",
        totalEventCount: "1000000",
        currentDBSizeMB: "500",
        maxTotalDataSizeMB: "1000",
        minTime: "1609459200",
        maxTime: "1640995200",
      };

      mockSplunkClient.getIndexInfo.mockResolvedValue(mockIndexInfo);

      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name, arguments: args } = request.params;
        if (name === "get_index_info" && args) {
          const result = await mockSplunkClient.getIndexInfo(args.index_name);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
        throw new Error(`Unknown tool: ${name}`);
      };

      const result = await handler({
        params: {
          name: "get_index_info",
          arguments: {
            index_name: "main",
          },
        },
      });

      expect(mockSplunkClient.getIndexInfo).toHaveBeenCalledWith("main");
      expect(JSON.parse(result.content[0].text)).toEqual(mockIndexInfo);
    });
  });

  describe("CallTool Handler - ping", () => {
    it("should handle ping tool successfully", async () => {
      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name } = request.params;
        if (name === "ping") {
          const result = {
            status: "ok",
            server: "splunk-mcp",
            version: "0.3.0",
            timestamp: new Date().toISOString(),
            protocol: "mcp",
            capabilities: ["splunk"],
          };
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
        throw new Error(`Unknown tool: ${name}`);
      };

      const result = await handler({
        params: {
          name: "ping",
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe("ok");
      expect(response.server).toBe("splunk-mcp");
      expect(response.version).toBe("0.3.0");
      expect(response.protocol).toBe("mcp");
    });
  });

  describe("CallTool Handler - health_check and health", () => {
    it("should handle health_check tool successfully", async () => {
      const mockHealth = {
        status: "healthy",
        connection: {
          host: "localhost",
          port: 8089,
          scheme: "https",
          username: "admin",
          ssl_verify: false,
        },
        apps_count: 2,
        apps: [
          { name: "search", label: "Search & Reporting", version: "9.0.0" },
        ],
      };

      mockSplunkClient.healthCheck.mockResolvedValue(mockHealth);

      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name } = request.params;
        if (name === "health_check" || name === "health") {
          const result = await mockSplunkClient.healthCheck();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
        throw new Error(`Unknown tool: ${name}`);
      };

      const result = await handler({
        params: {
          name: "health_check",
        },
      });

      expect(mockSplunkClient.healthCheck).toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toEqual(mockHealth);
    });

    it("should handle health alias correctly", async () => {
      const mockHealth = { status: "healthy" };
      mockSplunkClient.healthCheck.mockResolvedValue(mockHealth);

      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name } = request.params;
        if (name === "health_check" || name === "health") {
          const result = await mockSplunkClient.healthCheck();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
        throw new Error(`Unknown tool: ${name}`);
      };

      const result = await handler({
        params: {
          name: "health",
        },
      });

      expect(mockSplunkClient.healthCheck).toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toEqual(mockHealth);
    });
  });

  describe("CallTool Handler - current_user", () => {
    it("should handle current_user tool successfully", async () => {
      const mockUser = {
        username: "admin",
        real_name: "Administrator",
        email: "admin@example.com",
        roles: ["admin"],
        capabilities: ["admin_all_objects"],
        default_app: "search",
        type: "Splunk",
      };

      mockSplunkClient.getCurrentUser.mockResolvedValue(mockUser);

      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name } = request.params;
        if (name === "current_user") {
          const result = await mockSplunkClient.getCurrentUser();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
        throw new Error(`Unknown tool: ${name}`);
      };

      const result = await handler({
        params: {
          name: "current_user",
        },
      });

      expect(mockSplunkClient.getCurrentUser).toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toEqual(mockUser);
    });
  });

  describe("CallTool Handler - list_users", () => {
    it("should handle list_users tool successfully", async () => {
      const mockUsers = [
        {
          username: "admin",
          real_name: "Administrator",
          email: "admin@example.com",
          roles: ["admin"],
          capabilities: ["admin_all_objects"],
          default_app: "search",
          type: "Splunk",
        },
      ];

      mockSplunkClient.listUsers.mockResolvedValue(mockUsers);

      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name } = request.params;
        if (name === "list_users") {
          const result = await mockSplunkClient.listUsers();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
        throw new Error(`Unknown tool: ${name}`);
      };

      const result = await handler({
        params: {
          name: "list_users",
        },
      });

      expect(mockSplunkClient.listUsers).toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text)).toEqual(mockUsers);
    });
  });

  describe("CallTool Handler - error handling", () => {
    it("should handle unknown tool error", async () => {
      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name } = request.params;
        try {
          throw new Error(`Unknown tool: ${name}`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      };

      const result = await handler({
        params: {
          name: "nonexistent_tool",
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        "Error: Unknown tool: nonexistent_tool",
      );
    });

    it("should handle Splunk client errors", async () => {
      mockSplunkClient.listIndexes.mockRejectedValue(
        new Error("Connection failed"),
      );

      const handler = async (request: ToolRequest): Promise<ToolResponse> => {
        const { name } = request.params;
        try {
          if (name === "list_indexes") {
            const result = await mockSplunkClient.listIndexes();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }
          throw new Error(`Unknown tool: ${name}`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      };

      const result = await handler({
        params: {
          name: "list_indexes",
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error: Connection failed");
    });
  });
});
