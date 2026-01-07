#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from 'dotenv';
import { SplunkClient } from './splunk-client.js';
import type { SplunkConfig } from './types.js';

// Load environment variables
config();

const VERSION = '0.3.0';

// Get configuration from environment
const splunkConfig: SplunkConfig = {
  host: process.env.SPLUNK_HOST || 'localhost',
  port: parseInt(process.env.SPLUNK_PORT || '8089', 10),
  username: process.env.SPLUNK_USERNAME,
  password: process.env.SPLUNK_PASSWORD,
  token: process.env.SPLUNK_TOKEN,
  scheme: process.env.SPLUNK_SCHEME || 'https',
  verifySSL: process.env.VERIFY_SSL?.toLowerCase() !== 'false',
};

// Create Splunk client
const splunkClient = new SplunkClient(splunkConfig);

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'search_splunk',
    description:
      'Execute a Splunk search query and return the results.\n\nArgs:\n    search_query: The search query to execute\n    earliest_time: Start time for the search (default: 24 hours ago)\n    latest_time: End time for the search (default: now)\n    max_results: Maximum number of results to return (default: 100)',
    inputSchema: {
      type: 'object',
      properties: {
        search_query: {
          type: 'string',
          description: 'The Splunk search query to execute',
        },
        earliest_time: {
          type: 'string',
          description: 'Start time for the search (e.g., -24h, -7d)',
          default: '-24h',
        },
        latest_time: {
          type: 'string',
          description: 'End time for the search (e.g., now)',
          default: 'now',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 100,
        },
      },
      required: ['search_query'],
    },
  },
  {
    name: 'list_indexes',
    description: 'Get a list of all available Splunk indexes.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_index_info',
    description: 'Get metadata for a specific Splunk index.',
    inputSchema: {
      type: 'object',
      properties: {
        index_name: {
          type: 'string',
          description: 'Name of the index to get metadata for',
        },
      },
      required: ['index_name'],
    },
  },
  {
    name: 'list_saved_searches',
    description: 'List all saved searches in Splunk.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'current_user',
    description:
      'Get information about the currently authenticated user including username, roles, and capabilities.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_users',
    description: 'List all Splunk users (requires admin privileges).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_kvstore_collections',
    description:
      'List all KV store collections across apps with metadata including app, fields, and accelerated fields.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'health_check',
    description: 'Get basic Splunk connection information and list available apps.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_indexes_and_sourcetypes',
    description:
      'Get a list of all indexes and their sourcetypes with event counts and time range information.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ping',
    description:
      'Simple ping endpoint to check server availability and get basic server information.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'health',
    description:
      'Get basic Splunk connection information and list available apps (alias for health_check).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: 'splunk-mcp',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_splunk': {
        if (!args) throw new Error('Missing arguments');
        const results = await splunkClient.searchSplunk(
          args.search_query as string,
          (args.earliest_time as string) || '-24h',
          (args.latest_time as string) || 'now',
          (args.max_results as number) || 100
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'list_indexes': {
        const result = await splunkClient.listIndexes();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_index_info': {
        if (!args) throw new Error('Missing arguments');
        const result = await splunkClient.getIndexInfo(args.index_name as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'list_saved_searches': {
        const result = await splunkClient.listSavedSearches();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'current_user': {
        const result = await splunkClient.getCurrentUser();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'list_users': {
        const result = await splunkClient.listUsers();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'list_kvstore_collections': {
        const result = await splunkClient.listKVStoreCollections();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'health_check':
      case 'health': {
        const result = await splunkClient.healthCheck();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_indexes_and_sourcetypes': {
        const result = await splunkClient.getIndexesAndSourcetypes();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'ping': {
        const result = {
          status: 'ok',
          server: 'splunk-mcp',
          version: VERSION,
          timestamp: new Date().toISOString(),
          protocol: 'mcp',
          capabilities: ['splunk'],
        };
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 Splunk MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});