import axios, { type AxiosInstance } from "axios";
import https from "https";
import type {
  IndexesAndSourcetypes,
  KVStoreCollection,
  SavedSearch,
  SplunkApp,
  SplunkConfig,
  SplunkIndex,
  SplunkSearchResult,
  SplunkUser,
} from "./types.js";

export class SplunkClient {
  private client: AxiosInstance;
  private config: SplunkConfig;

  constructor(config: SplunkConfig) {
    this.config = config;

    const httpsAgent = new https.Agent({
      rejectUnauthorized: config.verifySSL,
    });

    const baseURL = `${config.scheme}://${config.host}:${config.port}`;

    // Prepare auth headers
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (config.token) {
      headers["Authorization"] = `Bearer ${config.token}`;
    }

    this.client = axios.create({
      baseURL,
      httpsAgent,
      headers,
      auth:
        !config.token && config.username && config.password
          ? {
              username: config.username,
              password: config.password,
            }
          : undefined,
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

  async searchSplunk(
    searchQuery: string,
    earliestTime: string = "-24h",
    latestTime: string = "now",
    maxResults: number = 100,
  ): Promise<SplunkSearchResult[]> {
    if (!searchQuery) {
      throw new Error("Search query cannot be empty");
    }

    // Prepend 'search' if not starting with '|' or 'search' (case-insensitive)
    const strippedQuery = searchQuery.trim();
    if (
      !strippedQuery.startsWith("|") &&
      !strippedQuery.toLowerCase().startsWith("search")
    ) {
      searchQuery = `search ${searchQuery}`;
    }

    try {
      this.log("🔍", `Executing search: ${searchQuery}`, "info");

      // Create search job
      const jobResponse = await this.client.post(
        "/services/search/jobs",
        new URLSearchParams({
          search: searchQuery,
          earliest_time: earliestTime,
          latest_time: latestTime,
          exec_mode: "blocking",
        }).toString(),
      );

      // Extract job SID from response
      const jobSid = this.extractSid(jobResponse.data);

      // Get results
      const resultsResponse = await this.client.get(
        `/services/search/jobs/${jobSid}/results`,
        {
          params: {
            output_mode: "json",
            count: maxResults,
          },
        },
      );

      return resultsResponse.data.results || [];
    } catch (error: any) {
      this.log("❌", `Search failed: ${error.message}`, "error");
      throw error;
    }
  }

  private extractSid(xmlData: string): string {
    const sidMatch = xmlData.match(/<sid>([^<]+)<\/sid>/);
    if (!sidMatch) {
      throw new Error("Failed to extract job SID from response");
    }
    return sidMatch[1];
  }

  async listIndexes(): Promise<{ indexes: string[] }> {
    try {
      const response = await this.client.get("/services/data/indexes", {
        params: { output_mode: "json" },
      });

      const indexes = response.data.entry.map((entry: any) => entry.name);
      this.log("📊", `Found ${indexes.length} indexes`, "info");
      return { indexes };
    } catch (error: any) {
      this.log("❌", `Failed to list indexes: ${error.message}`, "error");
      throw error;
    }
  }

  async getIndexInfo(indexName: string): Promise<SplunkIndex> {
    try {
      const response = await this.client.get(
        `/services/data/indexes/${indexName}`,
        {
          params: { output_mode: "json" },
        },
      );

      if (!response.data.entry || response.data.entry.length === 0) {
        throw new Error(`Index not found: ${indexName}`);
      }

      const content = response.data.entry[0].content;
      return {
        name: indexName,
        totalEventCount: String(content.totalEventCount || "0"),
        currentDBSizeMB: String(content.currentDBSizeMB || "0"),
        maxTotalDataSizeMB: String(content.maxTotalDataSizeMB || "0"),
        minTime: String(content.minTime || "0"),
        maxTime: String(content.maxTime || "0"),
      };
    } catch (error: any) {
      this.log("❌", `Failed to get index info: ${error.message}`, "error");
      throw error;
    }
  }

  async listSavedSearches(): Promise<SavedSearch[]> {
    try {
      const response = await this.client.get("/services/saved/searches", {
        params: { output_mode: "json" },
      });

      const savedSearches: SavedSearch[] = [];
      for (const entry of response.data.entry || []) {
        try {
          savedSearches.push({
            name: entry.name,
            description: entry.content?.description || "",
            search: entry.content?.search || "",
          });
        } catch (error: any) {
          this.log(
            "⚠️",
            `Error processing saved search: ${error.message}`,
            "info",
          );
        }
      }

      return savedSearches;
    } catch (error: any) {
      this.log(
        "❌",
        `Failed to list saved searches: ${error.message}`,
        "error",
      );
      throw error;
    }
  }

  async getCurrentUser(): Promise<SplunkUser> {
    try {
      this.log("👤", "Fetching current user information...", "info");

      let currentUsername = this.config.username || "admin";

      // Try to get username from current context
      try {
        const contextResponse = await this.client.get(
          "/services/authentication/current-context",
          {
            params: { output_mode: "json" },
          },
        );

        const contextData = contextResponse.data;
        if (contextData.entry && contextData.entry.length > 0) {
          const username = contextData.entry[0].content?.username;
          if (username) {
            currentUsername = username;
            this.log(
              "🔍",
              `Using username from current-context: ${currentUsername}`,
              "debug",
            );
          }
        }
      } catch (error: any) {
        this.log(
          "⚠️",
          `Could not get username from current-context: ${error.message}`,
          "info",
        );
      }

      // Get user information
      const userResponse = await this.client.get(
        `/services/authentication/users/${currentUsername}`,
        {
          params: { output_mode: "json" },
        },
      );

      if (!userResponse.data.entry || userResponse.data.entry.length === 0) {
        throw new Error(`User not found: ${currentUsername}`);
      }

      const content = userResponse.data.entry[0].content;
      const roles = Array.isArray(content.roles)
        ? content.roles
        : content.roles
          ? [content.roles]
          : [];
      const capabilities = Array.isArray(content.capabilities)
        ? content.capabilities
        : [];

      this.log(
        "✅",
        `Successfully retrieved current user information: ${currentUsername}`,
        "info",
      );

      return {
        username: currentUsername,
        real_name: content.realname || "N/A",
        email: content.email || "N/A",
        roles,
        capabilities,
        default_app: content.defaultApp || "search",
        type: content.type || "user",
      };
    } catch (error: any) {
      this.log("❌", `Error getting current user: ${error.message}`, "error");
      throw error;
    }
  }

  async listUsers(): Promise<SplunkUser[]> {
    try {
      this.log("👥", "Fetching Splunk users...", "info");

      const response = await this.client.get("/services/authentication/users", {
        params: { output_mode: "json" },
      });

      const users: SplunkUser[] = [];
      for (const entry of response.data.entry || []) {
        try {
          const content = entry.content;
          const roles = Array.isArray(content.roles)
            ? content.roles
            : content.roles
              ? [content.roles]
              : [];
          const capabilities = Array.isArray(content.capabilities)
            ? content.capabilities
            : content.capabilities
              ? [content.capabilities]
              : [];

          users.push({
            username: entry.name,
            real_name: content.realname || "N/A",
            email: content.email || "N/A",
            roles,
            capabilities,
            default_app: content.defaultApp || "search",
            type: content.type || "user",
          });

          this.log("✅", `Successfully processed user: ${entry.name}`, "debug");
        } catch (error: any) {
          this.log(
            "⚠️",
            `Error processing user ${entry.name}: ${error.message}`,
            "info",
          );
        }
      }

      this.log("✅", `Found ${users.length} users`, "info");
      return users;
    } catch (error: any) {
      this.log("❌", `Error listing users: ${error.message}`, "error");
      throw error;
    }
  }

  async listKVStoreCollections(): Promise<KVStoreCollection[]> {
    try {
      this.log("📚", "Fetching KV store collections...", "info");

      // Get collection stats
      const collectionStats: Record<string, number> = {};
      try {
        const statsResponse = await this.client.get(
          "/services/server/introspection/kvstore/collectionstats",
          {
            params: { output_mode: "json" },
          },
        );

        if (statsResponse.data.entry && statsResponse.data.entry.length > 0) {
          const content = statsResponse.data.entry[0].content;
          const data = content.data || [];
          for (const kvstore of data) {
            try {
              const parsed =
                typeof kvstore === "string" ? JSON.parse(kvstore) : kvstore;
              if (parsed.ns && parsed.count !== undefined) {
                collectionStats[parsed.ns] = parsed.count;
              }
            } catch (error: any) {
              this.log(
                "⚠️",
                `Error parsing KV store stat: ${error.message}`,
                "debug",
              );
            }
          }
          this.log(
            "✅",
            `Retrieved stats for ${Object.keys(collectionStats).length} KV store collections`,
            "debug",
          );
        }
      } catch (error: any) {
        this.log(
          "⚠️",
          `Error retrieving KV store collection stats: ${error.message}`,
          "info",
        );
      }

      // Get collections
      const response = await this.client.get(
        "/servicesNS/-/-/storage/collections/config",
        {
          params: { output_mode: "json" },
        },
      );

      const collections: KVStoreCollection[] = [];
      for (const entry of response.data.entry || []) {
        try {
          const collectionName = entry.name;
          const content = entry.content;
          const app = entry.acl?.app || "unknown";

          const fields: string[] = [];
          const accelFields: string[] = [];

          for (const key in content) {
            if (key.startsWith("field.")) {
              fields.push(key.replace("field.", ""));
            } else if (key.startsWith("accelerated_field.")) {
              accelFields.push(key.replace("accelerated_field.", ""));
            }
          }

          collections.push({
            name: collectionName,
            app,
            fields,
            accelerated_fields: accelFields,
            record_count: collectionStats[`${app}.${collectionName}`] || 0,
          });

          this.log(
            "✅",
            `Added collection: ${collectionName} from app: ${app}`,
            "debug",
          );
        } catch (error: any) {
          this.log(
            "⚠️",
            `Error processing collection entry: ${error.message}`,
            "info",
          );
        }
      }

      this.log(
        "✅",
        `Found ${collections.length} KV store collections`,
        "info",
      );
      return collections;
    } catch (error: any) {
      this.log(
        "❌",
        `Error listing KV store collections: ${error.message}`,
        "error",
      );
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: string;
    connection: any;
    apps_count: number;
    apps: SplunkApp[];
  }> {
    try {
      this.log("🏥", "Performing health check...", "info");

      const response = await this.client.get("/services/apps/local", {
        params: { output_mode: "json" },
      });

      const apps: SplunkApp[] = [];
      for (const entry of response.data.entry || []) {
        try {
          apps.push({
            name: entry.name,
            label: entry.content?.label || entry.name,
            version: entry.content?.version || "unknown",
          });
        } catch (error: any) {
          this.log(
            "⚠️",
            `Error getting info for app ${entry.name}: ${error.message}`,
            "info",
          );
        }
      }

      const result = {
        status: "healthy",
        connection: {
          host: this.config.host,
          port: this.config.port,
          scheme: this.config.scheme,
          username: this.config.username || "N/A",
          ssl_verify: this.config.verifySSL,
        },
        apps_count: apps.length,
        apps,
      };

      this.log(
        "✅",
        `Health check successful. Found ${apps.length} apps`,
        "info",
      );
      return result;
    } catch (error: any) {
      this.log("❌", `Health check failed: ${error.message}`, "error");
      throw error;
    }
  }

  async getIndexesAndSourcetypes(): Promise<IndexesAndSourcetypes> {
    try {
      this.log("📊", "Fetching indexes and sourcetypes...", "info");

      // Get list of indexes
      const indexesResponse = await this.listIndexes();
      const indexes = indexesResponse.indexes;
      this.log("🔍", `Found ${indexes.length} indexes`, "info");

      // Search for sourcetypes
      const searchQuery = `
        | tstats count WHERE index=* BY index, sourcetype
        | stats count BY index, sourcetype
        | sort - count
      `;

      const results = await this.searchSplunk(
        searchQuery,
        "-24h",
        "now",
        10000,
      );

      // Process results
      const sourcetypesByIndex: Record<
        string,
        Array<{ sourcetype: string; count: string }>
      > = {};
      for (const result of results) {
        const index = result.index || "";
        const sourcetype = result.sourcetype || "";
        const count = result.count || "0";

        if (!sourcetypesByIndex[index]) {
          sourcetypesByIndex[index] = [];
        }

        sourcetypesByIndex[index].push({
          sourcetype,
          count: String(count),
        });
      }

      const response: IndexesAndSourcetypes = {
        indexes,
        sourcetypes: sourcetypesByIndex,
        metadata: {
          total_indexes: indexes.length,
          total_sourcetypes: Object.values(sourcetypesByIndex).reduce(
            (sum, st) => sum + st.length,
            0,
          ),
          search_time_range: "24 hours",
        },
      };

      this.log("✅", "Successfully retrieved indexes and sourcetypes", "info");
      return response;
    } catch (error: any) {
      this.log(
        "❌",
        `Error getting indexes and sourcetypes: ${error.message}`,
        "error",
      );
      throw error;
    }
  }
}
