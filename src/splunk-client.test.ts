import axios, { type AxiosInstance } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SplunkClient } from "./splunk-client.js";
import type { SplunkConfig } from "./types.js";

// Mock axios
vi.mock("axios");

// Mock https
vi.mock("https", () => ({
  default: {
    Agent: vi.fn(),
  },
}));

describe("SplunkClient", () => {
  let client: SplunkClient;
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

  const mockConfig: SplunkConfig = {
    host: "localhost",
    port: 8089,
    username: "admin",
    password: "changeme",
    scheme: "https",
    verifySSL: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Suppress console logs during tests
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
    };

    // Mock axios.create to return our mock instance
    vi.mocked(axios.create).mockReturnValue(
      mockAxiosInstance as unknown as AxiosInstance,
    );

    client = new SplunkClient(mockConfig);
  });

  describe("searchSplunk", () => {
    it("should execute a search query successfully", async () => {
      const mockJobResponse = {
        data: '<?xml version="1.0"?><response><sid>12345</sid></response>',
      };
      const mockResultsResponse = {
        data: {
          results: [{ _time: "2024-01-01", host: "server1", message: "test" }],
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockJobResponse);
      mockAxiosInstance.get.mockResolvedValueOnce(mockResultsResponse);

      const results = await client.searchSplunk("index=main");

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        "/services/search/jobs",
        expect.any(String),
      );
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        "/services/search/jobs/12345/results",
        expect.objectContaining({
          params: {
            output_mode: "json",
            count: 100,
          },
        }),
      );
      expect(results).toEqual(mockResultsResponse.data.results);
    });

    it("should prepend 'search' to query if not present", async () => {
      const mockJobResponse = {
        data: '<?xml version="1.0"?><response><sid>12345</sid></response>',
      };
      const mockResultsResponse = { data: { results: [] } };

      mockAxiosInstance.post.mockResolvedValueOnce(mockJobResponse);
      mockAxiosInstance.get.mockResolvedValueOnce(mockResultsResponse);

      await client.searchSplunk("index=main");

      const postCall = mockAxiosInstance.post.mock.calls[0][1];
      expect(postCall.toString()).toContain("search+index%3Dmain");
    });

    it("should not prepend 'search' if query starts with pipe", async () => {
      const mockJobResponse = {
        data: '<?xml version="1.0"?><response><sid>12345</sid></response>',
      };
      const mockResultsResponse = { data: { results: [] } };

      mockAxiosInstance.post.mockResolvedValueOnce(mockJobResponse);
      mockAxiosInstance.get.mockResolvedValueOnce(mockResultsResponse);

      await client.searchSplunk("| stats count");

      const postCall = mockAxiosInstance.post.mock.calls[0][1];
      expect(postCall.toString()).toContain("%7C+stats+count");
    });

    it("should throw error if search query is empty", async () => {
      await expect(client.searchSplunk("")).rejects.toThrow(
        "Search query cannot be empty",
      );
    });

    it("should handle search errors", async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.searchSplunk("index=main")).rejects.toThrow(
        "Network error",
      );
    });

    it("should use custom time range and max results", async () => {
      const mockJobResponse = {
        data: '<?xml version="1.0"?><response><sid>12345</sid></response>',
      };
      const mockResultsResponse = { data: { results: [] } };

      mockAxiosInstance.post.mockResolvedValueOnce(mockJobResponse);
      mockAxiosInstance.get.mockResolvedValueOnce(mockResultsResponse);

      await client.searchSplunk("index=main", "-7d", "now", 500);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        "/services/search/jobs/12345/results",
        expect.objectContaining({
          params: {
            output_mode: "json",
            count: 500,
          },
        }),
      );
    });
  });

  describe("listIndexes", () => {
    it("should list all indexes successfully", async () => {
      const mockResponse = {
        data: {
          entry: [{ name: "main" }, { name: "security" }, { name: "_audit" }],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.listIndexes();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        "/services/data/indexes",
        { params: { output_mode: "json" } },
      );
      expect(result).toEqual({
        indexes: ["main", "security", "_audit"],
      });
    });

    it("should handle empty index list", async () => {
      const mockResponse = {
        data: {
          entry: [],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.listIndexes();

      expect(result).toEqual({ indexes: [] });
    });

    it("should handle errors when listing indexes", async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(
        new Error("Permission denied"),
      );

      await expect(client.listIndexes()).rejects.toThrow("Permission denied");
    });
  });

  describe("getIndexInfo", () => {
    it("should get index info successfully", async () => {
      const mockResponse = {
        data: {
          entry: [
            {
              content: {
                totalEventCount: "1000000",
                currentDBSizeMB: "500",
                maxTotalDataSizeMB: "1000",
                minTime: "1609459200",
                maxTime: "1640995200",
              },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getIndexInfo("main");

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        "/services/data/indexes/main",
        { params: { output_mode: "json" } },
      );
      expect(result).toEqual({
        name: "main",
        totalEventCount: "1000000",
        currentDBSizeMB: "500",
        maxTotalDataSizeMB: "1000",
        minTime: "1609459200",
        maxTime: "1640995200",
      });
    });

    it("should throw error if index not found", async () => {
      const mockResponse = {
        data: {
          entry: [],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      await expect(client.getIndexInfo("nonexistent")).rejects.toThrow(
        "Index not found: nonexistent",
      );
    });

    it("should handle missing content fields", async () => {
      const mockResponse = {
        data: {
          entry: [
            {
              content: {},
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getIndexInfo("main");

      expect(result).toEqual({
        name: "main",
        totalEventCount: "0",
        currentDBSizeMB: "0",
        maxTotalDataSizeMB: "0",
        minTime: "0",
        maxTime: "0",
      });
    });
  });

  describe("listSavedSearches", () => {
    it("should list saved searches successfully", async () => {
      const mockResponse = {
        data: {
          entry: [
            {
              name: "Error Report",
              content: {
                description: "Daily error report",
                search: "index=main error | stats count",
              },
            },
            {
              name: "Security Alert",
              content: {
                description: "Security alerts",
                search: "index=security | top user",
              },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.listSavedSearches();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        "/services/saved/searches",
        { params: { output_mode: "json" } },
      );
      expect(result).toEqual([
        {
          name: "Error Report",
          description: "Daily error report",
          search: "index=main error | stats count",
        },
        {
          name: "Security Alert",
          description: "Security alerts",
          search: "index=security | top user",
        },
      ]);
    });

    it("should handle empty saved searches", async () => {
      const mockResponse = {
        data: {
          entry: [],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.listSavedSearches();

      expect(result).toEqual([]);
    });

    it("should handle saved searches with missing fields", async () => {
      const mockResponse = {
        data: {
          entry: [
            {
              name: "Test Search",
              content: {},
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.listSavedSearches();

      expect(result).toEqual([
        {
          name: "Test Search",
          description: "",
          search: "",
        },
      ]);
    });
  });

  describe("getCurrentUser", () => {
    it("should get current user info successfully", async () => {
      const mockContextResponse = {
        data: {
          entry: [
            {
              content: {
                username: "admin",
              },
            },
          ],
        },
      };

      const mockUserResponse = {
        data: {
          entry: [
            {
              content: {
                realname: "Administrator",
                email: "admin@example.com",
                roles: ["admin", "user"],
                capabilities: ["admin_all_objects", "search"],
                defaultApp: "search",
                type: "Splunk",
              },
            },
          ],
        },
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce(mockContextResponse)
        .mockResolvedValueOnce(mockUserResponse);

      const result = await client.getCurrentUser();

      expect(result).toEqual({
        username: "admin",
        real_name: "Administrator",
        email: "admin@example.com",
        roles: ["admin", "user"],
        capabilities: ["admin_all_objects", "search"],
        default_app: "search",
        type: "Splunk",
      });
    });

    it("should fallback to config username if context fails", async () => {
      const mockUserResponse = {
        data: {
          entry: [
            {
              content: {
                realname: "Admin User",
                email: "admin@test.com",
                roles: ["admin"],
                capabilities: ["search"],
                defaultApp: "search",
                type: "Splunk",
              },
            },
          ],
        },
      };

      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error("Context not available"))
        .mockResolvedValueOnce(mockUserResponse);

      const result = await client.getCurrentUser();

      expect(result.username).toBe("admin");
    });

    it("should throw error if user not found", async () => {
      const mockContextResponse = {
        data: {
          entry: [{ content: { username: "admin" } }],
        },
      };

      const mockUserResponse = {
        data: {
          entry: [],
        },
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce(mockContextResponse)
        .mockResolvedValueOnce(mockUserResponse);

      await expect(client.getCurrentUser()).rejects.toThrow(
        "User not found: admin",
      );
    });
  });

  describe("listUsers", () => {
    it("should list all users successfully", async () => {
      const mockResponse = {
        data: {
          entry: [
            {
              name: "admin",
              content: {
                realname: "Administrator",
                email: "admin@example.com",
                roles: ["admin"],
                capabilities: ["admin_all_objects"],
                defaultApp: "search",
                type: "Splunk",
              },
            },
            {
              name: "user1",
              content: {
                realname: "Test User",
                email: "user1@example.com",
                roles: ["user"],
                capabilities: ["search"],
                defaultApp: "search",
                type: "Splunk",
              },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.listUsers();

      expect(result).toHaveLength(2);
      expect(result[0].username).toBe("admin");
      expect(result[1].username).toBe("user1");
    });

    it("should handle empty user list", async () => {
      const mockResponse = {
        data: {
          entry: [],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.listUsers();

      expect(result).toEqual([]);
    });
  });

  describe("healthCheck", () => {
    it("should perform health check successfully", async () => {
      const mockResponse = {
        data: {
          entry: [
            {
              name: "search",
              content: {
                label: "Search & Reporting",
                version: "9.0.0",
              },
            },
            {
              name: "launcher",
              content: {
                label: "Launcher",
                version: "9.0.0",
              },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

      const result = await client.healthCheck();

      expect(result.status).toBe("healthy");
      expect(result.connection.host).toBe("localhost");
      expect(result.apps_count).toBe(2);
      expect(result.apps).toHaveLength(2);
    });

    it("should handle health check errors", async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(
        new Error("Connection refused"),
      );

      await expect(client.healthCheck()).rejects.toThrow("Connection refused");
    });
  });

  describe("listKVStoreCollections", () => {
    it("should list KV store collections with stats", async () => {
      const mockStatsResponse = {
        data: {
          entry: [
            {
              content: {
                data: [
                  JSON.stringify({ ns: "search.lookup_table", count: 100 }),
                  JSON.stringify({ ns: "security.threat_list", count: 50 }),
                ],
              },
            },
          ],
        },
      };

      const mockCollectionsResponse = {
        data: {
          entry: [
            {
              name: "lookup_table",
              acl: { app: "search" },
              content: {
                "field.id": "number",
                "field.name": "string",
                "accelerated_field.name": "1",
              },
            },
            {
              name: "threat_list",
              acl: { app: "security" },
              content: {
                "field.ip": "string",
                "field.severity": "number",
              },
            },
          ],
        },
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce(mockStatsResponse)
        .mockResolvedValueOnce(mockCollectionsResponse);

      const result = await client.listKVStoreCollections();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "lookup_table",
        app: "search",
        fields: ["id", "name"],
        accelerated_fields: ["name"],
        record_count: 100,
      });
      expect(result[1]).toEqual({
        name: "threat_list",
        app: "security",
        fields: ["ip", "severity"],
        accelerated_fields: [],
        record_count: 50,
      });
    });

    it("should handle KV store collections without stats", async () => {
      const mockCollectionsResponse = {
        data: {
          entry: [
            {
              name: "test_collection",
              acl: { app: "search" },
              content: {
                "field.id": "string",
              },
            },
          ],
        },
      };

      mockAxiosInstance.get
        .mockRejectedValueOnce(new Error("Stats unavailable"))
        .mockResolvedValueOnce(mockCollectionsResponse);

      const result = await client.listKVStoreCollections();

      expect(result).toHaveLength(1);
      expect(result[0].record_count).toBe(0);
    });
  });

  describe("getIndexesAndSourcetypes", () => {
    it("should get indexes and sourcetypes successfully", async () => {
      const mockIndexesResponse = {
        indexes: ["main", "security"],
      };

      const mockSearchResults = [
        { index: "main", sourcetype: "access_log", count: "1000" },
        { index: "main", sourcetype: "error_log", count: "500" },
        { index: "security", sourcetype: "firewall", count: "2000" },
      ];

      // Mock listIndexes
      vi.spyOn(client, "listIndexes").mockResolvedValueOnce(
        mockIndexesResponse,
      );

      // Mock searchSplunk
      vi.spyOn(client, "searchSplunk").mockResolvedValueOnce(mockSearchResults);

      const result = await client.getIndexesAndSourcetypes();

      expect(result.indexes).toEqual(["main", "security"]);
      expect(result.sourcetypes.main).toHaveLength(2);
      expect(result.sourcetypes.security).toHaveLength(1);
      expect(result.metadata.total_indexes).toBe(2);
      expect(result.metadata.total_sourcetypes).toBe(3);
    });

    it("should handle search errors gracefully", async () => {
      vi.spyOn(client, "listIndexes").mockResolvedValueOnce({ indexes: [] });
      vi.spyOn(client, "searchSplunk").mockRejectedValueOnce(
        new Error("Search failed"),
      );

      await expect(client.getIndexesAndSourcetypes()).rejects.toThrow(
        "Search failed",
      );
    });
  });

  describe("configuration", () => {
    it("should create client with token authentication", () => {
      const tokenConfig: SplunkConfig = {
        ...mockConfig,
        token: "Bearer abc123",
        username: undefined,
        password: undefined,
      };

      const tokenClient = new SplunkClient(tokenConfig);
      expect(tokenClient).toBeInstanceOf(SplunkClient);
    });

    it("should create client with SSL verification enabled", () => {
      const sslConfig: SplunkConfig = {
        ...mockConfig,
        verifySSL: true,
      };

      const sslClient = new SplunkClient(sslConfig);
      expect(sslClient).toBeInstanceOf(SplunkClient);
    });

    it("should handle HTTP scheme", () => {
      const httpConfig: SplunkConfig = {
        ...mockConfig,
        scheme: "http",
      };

      const httpClient = new SplunkClient(httpConfig);
      expect(httpClient).toBeInstanceOf(SplunkClient);
    });
  });
});
