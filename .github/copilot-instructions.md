# Splunk MCP Project Guidelines

## Code Style

- **Formatter**: Biome (not Prettier/ESLint) - run `npm run check:fix` before committing
- **Quotes**: Double quotes (`"`) for TypeScript/JavaScript
- **Indentation**: 2 spaces
- **Async**: Always use `async/await`, never callbacks or `.then()` chains
- **Types**: Use `interface` (not `type`) for data structures - see [types.ts](../src/types.ts), [signalFx-types.ts](../src/signalFx-types.ts)
- **Imports**: ESM with `.js` extensions (Node16 module resolution)

## Architecture

### MCP Server ([index.ts](../src/index.ts))
- Entry point uses `#!/usr/bin/env node` for CLI execution
- Two transport modes: **stdio** (default) and **streamable** (HTTP on port 3000)
- Tools registered via `mcpServer.registerTool(name, description, async handler)`
- Tools grouped by category with comments (lines 86-89, 203-206)

### Client Pattern
- Axios-based clients with custom configuration in constructor
- All methods are `async`, return typed data or throw errors
- Private `log()` method for consistent emoji-based logging
- Example: [SplunkClient](../src/splunk-client.ts), [SignalFxClient](../src/signalFx-client.ts)

### Logging Convention
Use emoji prefixes: 🔍 (search), ✅ (success), ❌ (errors), ⚠️ (warnings), 🏥 (health), 📊 (data), 👤/👥 (users), 🚀 (startup) - see [splunk-client.ts#L66-L72](../src/splunk-client.ts)

### Tool Implementation Pattern
```typescript
mcpServer.registerTool("tool_name", { description: "..." }, async (extra) => {
  const args = getArgs(extra);
  return jsonResponse(await client.method(args.param));
});
```

### Conditional Features
SignalFx client is only registered if `SIGNALFX_ACCESS_TOKEN` is set - see [index.ts#L38-L44](../src/index.ts)

## Build and Test

```bash
npm run dev        # Development with hot-reload (tsx)
npm test           # Run Vitest test suite
npm run check:fix  # Biome lint + format (always run before commit)
npm run build      # TypeScript compilation to dist/
```

### Testing with Vitest
- **Structure**: `describe("ClientName", () => { describe("methodName", () => { it("should...", async () => {}) }) })`
- **Mocking**: Mock Axios with `vi.fn()` - see [splunk-client.test.ts#L6-L13](../src/splunk-client.test.ts)
- **Console**: Suppress logs with `vi.spyOn(console, "log").mockImplementation(() => {})`
- **Categories**: Unit tests (`*.test.ts`), mock integration (`*-mock.test.ts`), integration (`*-integration.test.ts`)
- **Coverage Target**: 88%+ (`npm test` runs coverage)

## Project Conventions

### Parameter Validation
Validate at method entry, throw descriptive errors:
```typescript
if (!searchQuery) throw new Error("Search query cannot be empty");
```

### MCP Tool Naming
- Use `snake_case` for tool names: `search_splunk`, `list_services`, `get_trace_details`
- Response wrapped in `jsonResponse()` helper with `type: "text"` content

### Configuration
- Environment variables with sensible defaults - see [index.ts#L23-L46](../src/index.ts)
- Use `dotenv` for `.env` file loading
- Required Node.js >= 24.0.0

### Error Handling
- Try-catch in all client methods
- Log errors with ❌ emoji before throwing
- Always rethrow after logging for proper error propagation

## Integration Points

### External APIs
- **Splunk REST API**: Enterprise/Cloud via basic auth or Bearer token, SSL configurable
- **SignalFx APM API**: Distributed tracing via `X-SF-Token` header authentication
- **MCP SDK**: `@modelcontextprotocol/sdk` for stdio and streamable transports

### Response Parsing
- Splunk responses: Extract from `response.data.entry` or `response.data`
- SignalFx traces: Parse nested spans with parent-child relationships
- See [splunk-client.ts#L93-L123](../src/splunk-client.ts) and [signalFx-client.ts](../src/signalFx-client.ts)
