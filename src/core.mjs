// Core engine: load the bundled OpenAPI spec, index operations, call the API.
// Source of truth = openapi.yaml (mirror of docs.mailtarget.co). Wraps what already exists.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";

const __dir = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dir, "..", "openapi.yaml");

let _spec = null;
export function loadSpec() {
  if (_spec) return _spec;
  _spec = yaml.load(readFileSync(SPEC_PATH, "utf8"));
  return _spec;
}

export function baseUrl() {
  const s = loadSpec();
  return (s.servers && s.servers[0] && s.servers[0].url) || "https://api.mailtarget.co";
}

export function token() {
  return process.env.MAILTARGET_API_KEY || process.env.MAILTARGET_TOKEN || "";
}

const METHODS = ["get", "post", "put", "patch", "delete"];

// Flatten paths -> [{ operationId, method, path, tag, summary, parameters, hasBody }]
export function listOperations({ tag, search } = {}) {
  const s = loadSpec();
  const ops = [];
  for (const [p, item] of Object.entries(s.paths || {})) {
    for (const m of METHODS) {
      const op = item[m];
      if (!op) continue;
      const t = (op.tags && op.tags[0]) || "untagged";
      const opId = op.operationId || `${m}_${p}`.replace(/[^a-zA-Z0-9]+/g, "_");
      ops.push({
        operationId: opId,
        method: m.toUpperCase(),
        path: p,
        tag: t,
        summary: op.summary || "",
        parameters: op.parameters || [],
        hasBody: !!op.requestBody,
      });
    }
  }
  let out = ops;
  if (tag) out = out.filter((o) => o.tag.toLowerCase().includes(tag.toLowerCase()));
  if (search) {
    const q = search.toLowerCase();
    out = out.filter(
      (o) =>
        o.operationId.toLowerCase().includes(q) ||
        o.path.toLowerCase().includes(q) ||
        o.summary.toLowerCase().includes(q) ||
        o.tag.toLowerCase().includes(q)
    );
  }
  return out;
}

export function findOperation(idOrPath, method) {
  const ops = listOperations();
  let op = ops.find((o) => o.operationId === idOrPath);
  if (!op && method) op = ops.find((o) => o.path === idOrPath && o.method === method.toUpperCase());
  return op || null;
}

export function describeOperation(operationId) {
  const op = findOperation(operationId);
  if (!op) return null;
  const s = loadSpec();
  const raw = s.paths[op.path][op.method.toLowerCase()];
  return {
    operationId: op.operationId,
    method: op.method,
    path: op.path,
    tag: op.tag,
    summary: op.summary,
    description: raw.description || "",
    parameters: (raw.parameters || []).map((p) => ({
      name: p.name, in: p.in, required: !!p.required, type: p.schema?.type, description: p.description || "",
    })),
    requestBody: raw.requestBody ? resolveBodyShape(s, raw.requestBody) : null,
  };
}

function resolveRef(s, ref) {
  if (!ref || !ref.startsWith("#/")) return null;
  return ref.slice(2).split("/").reduce((acc, k) => (acc ? acc[k] : null), s);
}
function resolveBodyShape(s, rb) {
  const json = rb.content?.["application/json"];
  let schema = json?.schema;
  if (schema?.$ref) schema = resolveRef(s, schema.$ref);
  if (!schema) return { note: "see docs for body shape" };
  if (schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, v.type || (v.$ref ? "object" : "any")])
    );
  }
  return { type: schema.type || "object" };
}

// Execute an operation against the live API.
export async function callOperation({ operationId, method, path, pathParams = {}, query = {}, body = null }) {
  let op = operationId ? findOperation(operationId) : null;
  let m = (op?.method || method || "GET").toUpperCase();
  let p = op?.path || path;
  if (!p) throw new Error("operation not found: provide operationId or method+path");
  // substitute :id / {id} path params
  for (const [k, v] of Object.entries(pathParams)) {
    p = p.replace(`{${k}}`, encodeURIComponent(v)).replace(`:${k}`, encodeURIComponent(v));
  }
  const url = new URL(baseUrl() + p);
  for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
  const tok = token();
  if (!tok) throw new Error("MAILTARGET_API_KEY not set");
  const res = await fetch(url, {
    method: m,
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body && m !== "GET" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, url: url.toString(), method: m, data };
}

// Transmission API lives on its own host (not in openapi.yaml).
// Canonical send endpoint per docs.mailtarget.co/api-reference/transmission.
export function transmissionUrl() {
  return process.env.MAILTARGET_TRANSMISSION_URL || "https://transmission.mailtarget.co/v1/layang/transmissions";
}

// Send a transactional email. payload follows the Transmission API shape:
// { subject, from: {email, name?}, to: [{email, name?}], bodyText?, bodyHtml?,
//   templateId?, substitutionData?, cc?, bcc?, replyTo?, headers?, attachments?, metadata? }
export async function sendTransmission(payload) {
  const tok = token();
  if (!tok) throw new Error("MAILTARGET_API_KEY not set");
  const res = await fetch(transmissionUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, url: transmissionUrl(), method: "POST", data };
}

export function specInfo() {
  const s = loadSpec();
  const ops = listOperations();
  const tags = [...new Set(ops.map((o) => o.tag))].sort();
  return { title: s.info?.title, version: s.info?.version, baseUrl: baseUrl(), operations: ops.length, tags };
}
