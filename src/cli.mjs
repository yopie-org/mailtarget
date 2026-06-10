#!/usr/bin/env node
// Mailtarget CLI — wraps api.mailtarget.co (spec-driven, covers everything in docs.mailtarget.co).
import { Command } from "commander";
import { listOperations, describeOperation, callOperation, specInfo, sendTransmission } from "./core.mjs";

const program = new Command();
program.name("mailtarget").description("Headless CLI for the Mailtarget Open API").version("0.1.0");

const out = (x) => console.log(typeof x === "string" ? x : JSON.stringify(x, null, 2));
const kv = (arr = []) => Object.fromEntries(arr.map((s) => { const i = s.indexOf("="); return [s.slice(0, i), s.slice(i + 1)]; }));

program.command("info").description("Spec summary (title, version, base URL, op count, tags)")
  .action(() => out(specInfo()));

program.command("list").description("List endpoints")
  .option("-t, --tag <tag>", "filter by tag").option("-s, --search <q>", "search id/path/summary")
  .action((o) => {
    const ops = listOperations({ tag: o.tag, search: o.search });
    out(ops.map((x) => `${x.method.padEnd(6)} ${x.path}  [${x.tag}]  ${x.operationId}`).join("\n") + `\n\n${ops.length} endpoints`);
  });

program.command("describe <operationId>").description("Show params + body shape for an endpoint")
  .action((id) => { const d = describeOperation(id); out(d || `not found: ${id}`); });

program.command("call <operationId>").description("Call an endpoint by operationId")
  .option("-p, --path <kv...>", "path params key=value").option("-q, --query <kv...>", "query params key=value")
  .option("-b, --body <json>", "JSON body, or @file").action(async (id, o) => {
    let body = o.body;
    if (body?.startsWith("@")) body = (await import("node:fs")).readFileSync(body.slice(1), "utf8");
    if (body) body = JSON.parse(body);
    out(await callOperation({ operationId: id, pathParams: kv(o.path), query: kv(o.query), body }));
  });

const readMaybeFile = async (v) => (v?.startsWith("@") ? (await import("node:fs")).readFileSync(v.slice(1), "utf8") : v);
const emails = (s) => s.split(",").map((e) => ({ email: e.trim() })).filter((x) => x.email);

program.command("send").description("Send a transactional email (Transmission API, transmission.mailtarget.co)")
  .option("--from <email>", "sender email (domain must be verified)")
  .option("--from-name <name>", "sender display name")
  .option("--to <emails>", "recipient(s), comma separated")
  .option("--subject <subject>", "subject line")
  .option("--text <body>", "plain-text body, or @file")
  .option("--html <body>", "HTML body, or @file")
  .option("--template <id>", "server-side templateId (replaces text/html)")
  .option("--data <json>", "substitutionData JSON")
  .option("--json <payload>", "raw Transmission payload JSON or @file (overrides other flags)")
  .action(async (o) => {
    let payload;
    if (o.json) payload = JSON.parse(await readMaybeFile(o.json));
    else {
      if (!o.from || !o.to || !o.subject) { console.error("need --from, --to, --subject (or --json)"); process.exit(1); }
      payload = { subject: o.subject, from: { email: o.from, ...(o.fromName ? { name: o.fromName } : {}) }, to: emails(o.to) };
      if (o.text) payload.bodyText = await readMaybeFile(o.text);
      if (o.html) payload.bodyHtml = await readMaybeFile(o.html);
      if (o.template) payload.templateId = o.template;
      if (o.data) payload.substitutionData = JSON.parse(o.data);
    }
    out(await sendTransmission(payload));
  });

const domain = program.command("domain").description("Sending domain helpers (Domain Auth)");
domain.command("list").description("List authenticated sending domains")
  .action(async () => out(await callOperation({ operationId: "domain_auth_get__v1_domain_auth" })));
domain.command("dns <id>").description("Show DNS records to publish for a domain")
  .action(async (id) => out(await callOperation({ operationId: "domain_auth_get__v1_domain_auth__id_dns_records", pathParams: { id } })));
domain.command("verify <id>").description("Trigger DNS verification for a domain")
  .action(async (id) => out(await callOperation({ operationId: "domain_auth_post__v1_domain_auth__id_verify", pathParams: { id } })));

program.command("api <method> <path>").description("Raw call escape hatch, e.g. api GET /v1/templates")
  .option("-q, --query <kv...>", "query key=value").option("-b, --body <json>", "JSON body, or @file")
  .action(async (method, path, o) => {
    let body = o.body;
    if (body?.startsWith("@")) body = (await import("node:fs")).readFileSync(body.slice(1), "utf8");
    if (body) body = JSON.parse(body);
    out(await callOperation({ method, path, query: kv(o.query), body }));
  });

program.parseAsync();
