#!/usr/bin/env node
// Mailtarget MCP server — exposes the whole Mailtarget Open API to AI agents via 3 dynamic tools.
// Small tool surface, full coverage of the 379 documented endpoints.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { listOperations, describeOperation, callOperation, specInfo, sendTransmission } from "./core.mjs";

const server = new Server(
  { name: "mailtarget", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "mailtarget_list_endpoints",
    description: "List Mailtarget API endpoints. Filter by tag (e.g. 'Contacts', 'Email Marketing', 'Senders') or free-text search. Use this to discover what is available before calling.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Filter by resource tag" },
        search: { type: "string", description: "Search operationId/path/summary" },
      },
    },
  },
  {
    name: "mailtarget_describe_endpoint",
    description: "Show the parameters, path params, and request body shape for one endpoint (by operationId). Call this before mailtarget_call_endpoint to know what to pass.",
    inputSchema: {
      type: "object",
      properties: { operationId: { type: "string" } },
      required: ["operationId"],
    },
  },
  {
    name: "mailtarget_call_endpoint",
    description: "Execute a Mailtarget API call against api.mailtarget.co (Bearer auth from MAILTARGET_API_KEY). Provide operationId plus pathParams/query/body as needed. Mutating calls (POST/PUT/DELETE) act on the live account, use with care.",
    inputSchema: {
      type: "object",
      properties: {
        operationId: { type: "string", description: "operationId from list/describe" },
        pathParams: { type: "object", description: "path params, e.g. {id: '123'}" },
        query: { type: "object", description: "query params" },
        body: { type: "object", description: "JSON request body" },
      },
      required: ["operationId"],
    },
  },
  {
    name: "mailtarget_send_email",
    description: "Send a transactional email via the Mailtarget Transmission API (transmission.mailtarget.co). The from.email domain must be a verified sending domain on the account. Sends real email — use with care.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        from: { type: "object", description: "{email, name?} — domain must be verified", properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] },
        to: { type: "array", description: "recipients, each {email, name?}", items: { type: "object", properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] } },
        bodyText: { type: "string", description: "plain-text body" },
        bodyHtml: { type: "string", description: "HTML body" },
        templateId: { type: "string", description: "server-side template id (replaces bodyText/bodyHtml)" },
        substitutionData: { type: "object", description: "template substitution variables" },
        cc: { type: "array", items: { type: "object" } },
        bcc: { type: "array", items: { type: "object" } },
        replyTo: { type: "object" },
        headers: { type: "object" },
        attachments: { type: "array", description: "[{name, type, data(base64)}]", items: { type: "object" } },
        metadata: { type: "object", description: "free-form key-values echoed into webhook events" },
      },
      required: ["subject", "from", "to"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  const text = (x) => ({ content: [{ type: "text", text: typeof x === "string" ? x : JSON.stringify(x, null, 2) }] });
  try {
    if (name === "mailtarget_list_endpoints") {
      const ops = listOperations({ tag: a.tag, search: a.search })
        .map((o) => ({ operationId: o.operationId, method: o.method, path: o.path, tag: o.tag, summary: o.summary }));
      return text({ count: ops.length, endpoints: ops.slice(0, 200) });
    }
    if (name === "mailtarget_describe_endpoint") {
      return text(describeOperation(a.operationId) || `not found: ${a.operationId}`);
    }
    if (name === "mailtarget_send_email") {
      return text(await sendTransmission(a));
    }
    if (name === "mailtarget_call_endpoint") {
      return text(await callOperation({ operationId: a.operationId, pathParams: a.pathParams || {}, query: a.query || {}, body: a.body || null }));
    }
    return text(`unknown tool: ${name}`);
  } catch (e) {
    return { content: [{ type: "text", text: `error: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`mailtarget MCP ready — ${specInfo().operations} endpoints from ${specInfo().title} v${specInfo().version}`);
