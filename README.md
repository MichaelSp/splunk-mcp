# Splunk MCP (Model Context Protocol) Server

A TypeScript-based Model Context Protocol server for interacting with Splunk Enterprise/Cloud and SignalFx. This tool provides a comprehensive set of capabilities for searching Splunk data, managing KV stores, and accessing distributed traces through SignalFx APM.

## Features

### Splunk Integration
- **Splunk Search**: Execute Splunk searches with natural language queries
- **Index Management**: List and inspect Splunk indexes
- **User Management**: View and manage Splunk users
- **KV Store Operations**: List and manage KV store collections

### SignalFx APM & Traces (New!)
- **Service Discovery**: List all services in your environment
- **Trace Search**: Search for traces by service, operation, duration, errors
- **Trace Analysis**: Get detailed trace information with spans and timing
- **Performance Metrics**: Retrieve latency metrics (p50, p75, p90, p99)
- **Error Tracking**: Monitor error rates and error types by service/operation

### Technical Features
- **Async Support**: Built with async/await patterns for better performance
- **Detailed Logging**: Comprehensive logging with emoji indicators for better visibility
- **SSL Configuration**: Flexible SSL verification options for different security requirements
- **TypeScript**: Fully typed implementation for better developer experience
- **High Test Coverage**: 88%+ test coverage with comprehensive test suite

## Available MCP Tools

The following tools are available via the MCP interface:

### Tools Management
- **ping**
  - Simple ping endpoint to verify MCP server is alive and check enabled capabilities

### Health Check
- **health_check** / **health**
  - Returns a list of available Splunk apps to verify connectivity

### User Management
- **current_user**
  - Returns information about the currently authenticated user
- **list_users**
  - Returns a list of all users and their roles

### Index Management
- **list_indexes**
  - Returns a list of all accessible Splunk indexes
- **get_index_info**
  - Returns detailed information about a specific index
  - Parameters: index_name (string)
- **get_indexes_and_sourcetypes**
  - Returns a comprehensive list of indexes and their sourcetypes

### Search
- **search_splunk**
  - Executes a Splunk search query
  - Parameters:
    - search_query (string): Splunk search string
    - earliest_time (string, optional): Start time for search window (default: -24h)
    - latest_time (string, optional): End time for search window (default: now)
    - max_results (integer, optional): Maximum number of results to return (default: 100)
- **list_saved_searches**
  - Returns a list of saved searches in the Splunk instance

### KV Store
- **list_kvstore_collections**
  - Lists all KV store collections with metadata including app, fields, and accelerated fields

### SignalFx Traces (New!)

#### Service Management
- **list_services**
  - Lists all available services in the SignalFx environment
  - Returns: service name, operation count, error status, last seen timestamp

- **get_service_operations**
  - Gets operations available for a specific service
  - Parameters:
    - service_name (string): Name of the service

#### Trace Operations
- **search_traces**
  - Search for traces based on multiple criteria
  - Parameters:
    - service (string, optional): Filter by service name
    - operation (string, optional): Filter by operation name
    - min_duration (number, optional): Minimum duration in milliseconds
    - max_duration (number, optional): Maximum duration in milliseconds
    - has_errors (boolean, optional): Filter for traces with errors
    - limit (number, optional): Maximum number of traces to return (default: 100)
    - offset (number, optional): Offset for pagination (default: 0)
  - Returns: Array of matching traces with trace ID, spans, duration, services

- **get_trace_details**
  - Get detailed information about a specific trace
  - Parameters:
    - trace_id (string): The ID of the trace to retrieve
  - Returns: Complete trace with all spans, tags, logs, timing information, and parent-child relationships

#### Metrics & Analytics
- **get_latency_metrics**
  - Get latency percentiles for a service or operation
  - Parameters:
    - service (string): Service name
    - operation (string, optional): Operation name
  - Returns: p50, p75, p90, p99, mean, min, max latencies and sample count

- **get_error_metrics**
  - Get error statistics for a service or operation
  - Parameters:
    - service (string): Service name
    - operation (string, optional): Operation name
  - Returns: error count, total count, error rate, breakdown by error type

## Usage with MCP Clients

### Claude Desktop

Add the server to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

#### Splunk Only Configuration

```json
{
  "mcpServers": {
    "splunk": {
      "command": "bunx",
      "args": ["splunk-mcp"],
      "env": {
        "SPLUNK_HOST": "your_splunk_host",
        "SPLUNK_PORT": "8089",
        "SPLUNK_USERNAME": "your_username",
        "SPLUNK_PASSWORD": "your_password",
        "SPLUNK_SCHEME": "https",
        "VERIFY_SSL": "true"
      }
    }
  }
}
```

#### Splunk + SignalFx Configuration

```json
{
  "mcpServers": {
    "splunk": {
      "command": "bunx",
      "args": ["splunk-mcp"],
      "env": {
        "SPLUNK_HOST": "your_splunk_host",
        "SPLUNK_PORT": "8089",
        "SPLUNK_USERNAME": "your_username",
        "SPLUNK_PASSWORD": "your_password",
        "SPLUNK_SCHEME": "https",
        "VERIFY_SSL": "true",
        "SIGNALFX_ACCESS_TOKEN": "your_signalfx_token",
        "SIGNALFX_REALM": "us0"
      }
    }
  }
}
```

Or using npx:

```json
{
  "mcpServers": {
    "splunk": {
      "command": "npx",
      "args": ["-y", "splunk-mcp"],
      "env": {
        "SPLUNK_HOST": "your_splunk_host",
        "SPLUNK_PORT": "8089",
        "SPLUNK_USERNAME": "your_username",
        "SPLUNK_PASSWORD": "your_password",
        "SPLUNK_SCHEME": "https",
        "VERIFY_SSL": "true",
        "SIGNALFX_ACCESS_TOKEN": "your_signalfx_token",
        "SIGNALFX_REALM": "us0"
      }
    }
  }
}
```

### Cline / Other MCP Clients

Configure the MCP server in your client's settings with the command:

```bash
bunx splunk-mcp
```

And provide the required environment variables through your client's configuration.

## Example Queries

Once connected, you can use natural language to interact with Splunk and SignalFx:

### Splunk Examples
- "Search for errors in the last hour"
- "List all available indexes"
- "Show me the current user information"
- "Get information about the 'main' index"
- "List all saved searches"
- "Show me all KV store collections"

### SignalFx Traces Examples
- "List all services in SignalFx"
- "Show me operations for the auth-service"
- "Search for traces with errors in the payment-service"
- "Find slow traces over 5 seconds"
- "Get details for trace ID abc123"
- "Show latency metrics for the api-gateway service"
- "What's the error rate for the checkout operation?"
- "Find traces for the user-service that took between 100ms and 1000ms"

## Environment Variables

### Splunk Configuration (Required)
- `SPLUNK_HOST`: Splunk server hostname
- `SPLUNK_PORT`: Splunk management port (default: 8089)
- `SPLUNK_USERNAME`: Splunk username (if not using token auth)
- `SPLUNK_PASSWORD`: Splunk password (if not using token auth)
- `SPLUNK_TOKEN`: Splunk authentication token (alternative to username/password)
- `SPLUNK_SCHEME`: Connection scheme (http or https, default: https)
- `VERIFY_SSL`: SSL certificate verification (true/false, default: true)

### SignalFx Configuration (Optional)
- `SIGNALFX_ACCESS_TOKEN`: SignalFx API access token (required to enable SignalFx features)
- `SIGNALFX_REALM`: SignalFx realm (e.g., us0, us1, eu0, default: us0)
- `SIGNALFX_BASE_URL`: Custom SignalFx API base URL (optional, for custom deployments)

## Error Handling

The MCP implementation includes consistent error handling:

- Invalid search commands or malformed requests
- Insufficient permissions
- Resource not found
- Invalid input validation
- Unexpected server errors
- Connection issues with Splunk/SignalFx servers
- Missing required parameters
- Authentication failures

All error responses include a detailed message explaining the error.

## Installation

### Prerequisites
- Node.js 18 or higher
- Access to a Splunk Enterprise or Splunk Cloud instance

### Using bunx (Recommended)

You can run the server directly using `bunx` without installation:

```bash
bunx splunk-mcp
```

### Using npx

Alternatively, use `npx`:

```bash
npx splunk-mcp
```

### Local Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd splunk-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Run the server:**
   ```bash
   npm start
   ```

### Development

For development with hot reload:

```bash
npm run dev
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
SPLUNK_HOST=your_splunk_host
SPLUNK_PORT=8089
SPLUNK_USERNAME=your_username
SPLUNK_PASSWORD=your_password
SPLUNK_SCHEME=https
VERIFY_SSL=true
```

Alternatively, use token-based authentication:

```env
SPLUNK_HOST=your_splunk_host
SPLUNK_PORT=8089
SPLUNK_TOKEN=your_auth_token
SPLUNK_SCHEME=https
VERIFY_SSL=true
```

**Note**: If `SPLUNK_TOKEN` is set, it will be used for authentication and username/password will be ignored.

### SSL Configuration

The tool provides flexible SSL verification options:

1. **Default (Secure) Mode**:
   ```env
   VERIFY_SSL=true
   ```
   - Full SSL certificate verification
   - Hostname verification enabled
   - Recommended for production environments

2. **Relaxed Mode**:
   ```env
   VERIFY_SSL=false
   ```
   - SSL certificate verification disabled
   - Useful for testing or self-signed certificates


## Development

### Project Structure

```
splunk-mcp/
├── src/
│   ├── index.ts           # Main MCP server
│   ├── splunk-client.ts   # Splunk API client
│   └── types.ts           # TypeScript type definitions
├── dist/                  # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

### Testing

```bash
npm test
```

## Security Notes

1. **Environment Variables**:
   - Never commit `.env` files to version control
   - Use `.env.example` as a template
   - Consider using secure credential storage for production

2. **SSL Verification**:
   - `VERIFY_SSL=true` recommended for production
   - Can be disabled for development/testing with self-signed certificates
   - Configure through environment variables

3. **Authentication**:
   - Supports both username/password and token-based authentication
   - Token authentication is preferred when available
   - Ensure credentials have appropriate permissions

## License

Apache-2.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
