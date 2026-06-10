# mailtarget

Headless **CLI + MCP server** for Mailtarget. Spec-driven: wraps everything documented at docs.mailtarget.co (504 operations on `api.mailtarget.co`) without hardcoding each one, plus the Transmission API (`transmission.mailtarget.co`) for sending. Source of truth = bundled `openapi.yaml`.

## Auth

Set your Mailtarget API key (Bearer):

```bash
export MAILTARGET_API_KEY=...
```

Two hosts, two key scopes:

- `transmission.mailtarget.co` — sending (Transmission API). Transmission keys work here.
- `api.mailtarget.co` — management Open API (templates, domains, contacts, ...). Needs an Open API key issued from the dashboard; a transmission-only key returns 401 here.

## CLI

```bash
mailtarget info                          # spec summary + tags
mailtarget list --tag Contacts           # endpoints in a tag
mailtarget list --search template
mailtarget describe <operationId>        # params + body shape
mailtarget call <operationId> -q page=1 perPage=10
mailtarget call <operationId> -p id=123 -b '{"name":"x"}'
mailtarget api GET /v1/template          # raw escape hatch

# convenience: send transactional email (Transmission API)
mailtarget send --from you@verified-domain.com --to user@example.com \
  --subject "Hello" --text "Hello"
mailtarget send --json @payload.json     # full Transmission payload

# convenience: sending domains (Domain Auth)
mailtarget domain list
mailtarget domain dns <id>               # DNS records to publish
mailtarget domain verify <id>            # trigger verification
```

Before publish, run via `node src/cli.mjs ...` or `npm link`.

## MCP server

Stdio MCP exposing 4 tools (small surface, full coverage):

- `mailtarget_list_endpoints` — discover endpoints (filter by tag/search)
- `mailtarget_describe_endpoint` — params + body shape for one endpoint
- `mailtarget_call_endpoint` — execute against the live management API
- `mailtarget_send_email` — send transactional email (Transmission API)

Register in Claude Code / any MCP client:

```json
{
  "mcpServers": {
    "mailtarget": {
      "command": "node",
      "args": ["/path/to/mailtarget-headless/src/mcp.mjs"],
      "env": { "MAILTARGET_API_KEY": "..." }
    }
  }
}
```

## Library

```js
import { sendTransmission, callOperation, listOperations } from "mailtarget";
```

TypeScript declarations ship in `types/index.d.ts` (payload shapes for the Transmission API included).

## Scope (v1)

Wraps the documented/live surface as-is. Mutating calls hit the live account, use with care. Parts of the 504-operation spec are not yet deployed in production; endpoints that are not live return 401/404.
