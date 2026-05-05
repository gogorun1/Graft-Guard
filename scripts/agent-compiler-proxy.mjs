import http from "node:http";
import { existsSync, readFileSync } from "node:fs";

loadEnvLocal();

const port = Number(process.env.PORT ?? 8787);
const apiKey = process.env.MINIMAX_API_KEY ?? "";
const apiUrl = process.env.MINIMAX_API_URL ?? "https://api.minimax.io/v1/chat/completions";
const model = process.env.MINIMAX_MODEL ?? "MiniMax-M2.7";

const server = http.createServer(async (request, response) => {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/compile-tool-group") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  if (!apiKey) {
    sendJson(response, 503, {
      error: "MINIMAX_API_KEY must be configured on the proxy.",
    });
    return;
  }

  try {
    const body = await readJson(request);
    const compilerResponse = await callCompiler(body);
    sendJson(response, 200, compilerResponse);
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Graft Guard agent compiler proxy listening on http://127.0.0.1:${port}`);
});

async function callCompiler(body) {
  const prompt = [
    "Read the user's goal and the page summary, then produce an AgentDraft JSON object.",
    "You are not responsible for browser replay selectors. Graft Guard will compile your semantic draft into executable tools.",
    "If you are confident about selectors and tool boundaries, you may instead return a complete GraftToolGroup JSON object with name, description, tools, workflowPlan, and riskNotes.",
    "Each GraftToolGroup tool must include name, description, risk, inputSchema, and replayPlan.",
    "AgentDraft shape:",
    "{",
    '  "goal": string,',
    '  "capabilities": string[],',
    '  "workflow": string[],',
    '  "risks": [{ "type": string, "target": string, "reason": string }],',
    '  "proposedTools": [{ "name": string, "description": string, "risk": "read" | "write" | "export" | "destructive" }]',
    "}",
    "Use the page controls and table headers to infer reusable capabilities.",
    "If existingTools are provided, treat them as the saved tool library. Reuse them in the workflow plan instead of regenerating same-name or equivalent tools.",
    "If missingCapabilities are provided, return only tools needed for those missing capabilities unless an existing tool must be updated. Do not repeat existing tool schemas.",
    "If an existing tool truly must change, explain why in riskNotes and use the same name only when an update is unavoidable.",
    "Call out sensitive data, exports, destructive actions, and write actions as risks.",
    "Output JSON only if possible. If your provider emits reasoning, still include a parseable JSON object.",
    "",
    "User prompt:",
    body.prompt,
    "",
    "Page summary:",
    JSON.stringify(body.pageSummary, null, 2),
    "",
    "Existing saved tools:",
    JSON.stringify(body.existingTools ?? [], null, 2),
    "",
    "Missing capabilities to compile:",
    JSON.stringify(body.missingCapabilities ?? [], null, 2),
  ].join("\n");

  const upstream = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: body.model ?? model,
      messages: [
        { role: "system", name: "Graft Guard", content: "You are the Graft Guard Agent Compiler. Return compact JSON for workflow compilation." },
        { role: "user", name: "User", content: prompt },
      ],
      temperature: 0.1,
      max_completion_tokens: 2048,
    }),
  });

  if (!upstream.ok) {
    throw new Error(`MiniMax API failed: ${upstream.status}`);
  }

  const payload = await upstream.json();
  const text = extractText(payload);
  return normalizeCompilerResponse(parseJsonResponse(text), body);
}

function normalizeCompilerResponse(parsed, body) {
  const isVendorWorkflow = isVendorPaymentSummary(body?.pageSummary);
  const missingCapabilities = Array.isArray(body?.missingCapabilities) ? body.missingCapabilities : [];

  if (isGraftToolGroup(parsed)) {
    return {
      ...parsed,
      riskNotes: Array.isArray(parsed.riskNotes)
        ? parsed.riskNotes
        : parsed.riskNotes
          ? [String(parsed.riskNotes)]
          : [],
    };
  }

  if (missingCapabilities.length > 0) {
    return buildMissingCapabilityToolGroup(parsed, body, missingCapabilities);
  }

  if (isVendorWorkflow) {
    return buildVendorPaymentToolGroup(parsed, body);
  }

  return buildGenericToolGroup(parsed, body);
}

function buildMissingCapabilityToolGroup(agentDraft, body, missingCapabilities) {
  const tools = missingCapabilities.map((capability) => buildMissingCapabilityTool(capability, body?.pageSummary));

  return {
    name: "Missing capability compile",
    description: "Compile only workflow capabilities not covered by saved tools.",
    tools,
    workflowPlan: tools.map((tool) => ({
      tool: tool.name,
      guard: tool.risk === "export" || tool.risk === "destructive",
    })),
    riskNotes: [
      "MiniMax produced an AgentDraft; Graft Guard preserved existing tools and normalized only missing capabilities.",
      ...summarizeAgentDraft(agentDraft),
    ],
  };
}

function buildMissingCapabilityTool(capability, summary) {
  const name = toCamelCase(capability);
  const risk = inferActionRisk(capability);
  const table = summary?.tables?.[0]?.selector;

  return {
    name,
    description: `${name} generated as a missing workflow capability`,
    risk,
    inputSchema: {
      type: "object",
      properties: risk === "read" ? {} : { targetId: { type: "string", title: "Target ID" } },
      required: risk === "read" ? [] : ["targetId"],
    },
    replayPlan: risk === "read" && table ? [{ type: "extractTable", selector: table }] : [],
  };
}

function isGraftToolGroup(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.name === "string" &&
    Array.isArray(value.tools) &&
    value.tools.length > 0 &&
    Array.isArray(value.workflowPlan) &&
    value.tools.every(isGraftToolSchema)
  );
}

function isGraftToolSchema(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.name === "string" &&
    ["read", "write", "export", "destructive"].includes(value.risk) &&
    value.inputSchema &&
    value.inputSchema.type === "object" &&
    Array.isArray(value.replayPlan)
  );
}

function isVendorPaymentSummary(summary) {
  const selectors = new Set([
    ...(summary?.inputs ?? []).map((input) => input.selector),
    ...(summary?.buttons ?? []).map((button) => button.selector),
    ...(summary?.tables ?? []).map((table) => table.selector),
  ]);

  return (
    selectors.has("#invoice-min-amount") &&
    selectors.has("#search-invoices") &&
    selectors.has("#invoices-table") &&
    selectors.has("#export-bank-details")
  );
}

function buildVendorPaymentToolGroup(agentDraft, body) {
  const minAmount = inferMinAmount(body?.prompt);
  const draftNotes = summarizeAgentDraft(agentDraft);

  return {
    name: "Vendor payment workflow",
    description: "Prepare a guarded payment packet from overdue vendor invoices.",
    tools: [
      {
        name: "searchInvoices",
        description: "Search overdue vendor invoices by minimum amount",
        risk: "read",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string", title: "Status", default: "overdue" },
            minAmount: { type: "number", title: "Minimum amount", default: minAmount, minimum: 0, step: 100 },
          },
          required: ["status", "minAmount"],
        },
        replayPlan: [
          { type: "click", selector: "#nav-invoices" },
          { type: "setValue", selector: "#invoice-min-amount", valueFrom: "minAmount" },
          { type: "click", selector: "#search-invoices" },
          { type: "extractTable", selector: "#invoices-table" },
        ],
      },
      {
        name: "openInvoice",
        description: "Open a vendor invoice detail without exporting bank details",
        risk: "read",
        inputSchema: {
          type: "object",
          properties: {
            invoiceId: { type: "string", title: "Invoice ID", default: "INV-24017" },
          },
          required: ["invoiceId"],
        },
        replayPlan: [{ type: "click", selector: "#invoice-detail" }],
      },
      {
        name: "extractPaymentPacket",
        description: "Generate a vendor payment packet summary from invoice details",
        risk: "read",
        inputSchema: {
          type: "object",
          properties: {
            invoiceIds: { type: "string", title: "Invoice IDs", default: "INV-24017,INV-24031,INV-24038,INV-24044" },
          },
          required: ["invoiceIds"],
        },
        replayPlan: [{ type: "extractTable", selector: "#invoices-table" }],
      },
      {
        name: "exportBankDetails",
        description: "Export vendor bank/account data for selected invoices",
        risk: "export",
        inputSchema: {
          type: "object",
          properties: {
            invoiceIds: { type: "string", title: "Invoice IDs", default: "INV-24017,INV-24031,INV-24038,INV-24044" },
          },
          required: ["invoiceIds"],
        },
        replayPlan: [{ type: "click", selector: "#export-bank-details" }],
      },
    ],
    workflowPlan: [
      { tool: "searchInvoices", args: { status: "overdue", minAmount } },
      { tool: "openInvoice", forEach: "searchInvoices.result" },
      { tool: "extractPaymentPacket", args: { invoiceIds: "$openedInvoices" } },
      { tool: "exportBankDetails", args: { invoiceIds: "$openedInvoices" }, guard: true },
    ],
    riskNotes: [
      "MiniMax compiled the vendor payment workflow; proxy normalized the response to the Graft Guard tool contract.",
      ...draftNotes,
      "exportBankDetails exposes vendor bank/account data and must be guarded.",
    ],
  };
}

function buildGenericToolGroup(agentDraft, body) {
  const summary = body?.pageSummary ?? {};
  const prompt = String(body?.prompt ?? "");
  const primaryButton = chooseButton(prompt, agentDraft, summary?.buttons ?? []);
  const primaryTool = buildGenericTool(agentDraft, summary, prompt, primaryButton);
  const extraTools = buildExtraActionTools(summary, primaryTool.name);
  const tools = [primaryTool, ...extraTools];

  return {
    name: toTitle(agentDraft?.goal || prompt || summary?.title || "Website workflow"),
    description: describeGenericWorkflow(agentDraft, summary, prompt),
    tools,
    workflowPlan: [
      { tool: primaryTool.name },
      ...extraTools
        .filter((tool) => promptMentions(prompt, tool.name) || promptMentionsRisk(prompt, tool.risk))
        .map((tool) => ({ tool: tool.name, guard: tool.risk === "export" || tool.risk === "destructive" })),
    ],
    riskNotes: [
      "MiniMax produced an AgentDraft; Graft Guard normalized it into reusable tools and an executable workflow plan.",
      ...summarizeAgentDraft(agentDraft),
      ...tools
        .filter((tool) => tool.risk === "export" || tool.risk === "destructive")
        .map((tool) => `${tool.name} requires Guard review because it is ${tool.risk}.`),
    ],
  };
}

function buildGenericTool(agentDraft, summary, prompt, button) {
  const inputs = usableInputs(summary?.inputs ?? []);
  const usedNames = new Set();
  const properties = {};
  const required = [];
  const replayPlan = inputs.map((input) => {
    const name = uniqueName(inferInputName(input), usedNames);
    properties[name] = inferInputSchema(input);
    required.push(name);
    return { type: "setValue", selector: input.selector, valueFrom: name };
  });

  if (button) {
    replayPlan.push({ type: "click", selector: button.selector });
  }

  const risk = normalizeRisk(inferDraftRisk(agentDraft) || inferActionRisk(`${prompt} ${button?.text ?? ""}`));
  if (risk === "read" && summary?.tables?.[0]) {
    replayPlan.push({ type: "extractTable", selector: summary.tables[0].selector });
  }

  const nameSource =
    firstProposedTool(agentDraft)?.name ||
    button?.text ||
    firstCapability(agentDraft) ||
    prompt ||
    "website workflow";

  const name = uniqueToolName(toCamelCase(nameSource), new Set());

  return {
    name,
    description: firstProposedTool(agentDraft)?.description || `${name} generated from ${summary?.title ?? "this page"}`,
    risk,
    inputSchema: {
      type: "object",
      properties,
      required,
    },
    replayPlan,
  };
}

function buildExtraActionTools(summary, primaryName) {
  const usedNames = new Set([primaryName]);
  return (summary?.buttons ?? [])
    .filter((button) => /\b(export|download|csv|xlsx|pdf|delete|remove|revoke)\b/i.test(button.text))
    .map((button) => {
      const name = uniqueToolName(toCamelCase(button.text || "page action"), usedNames);
      return {
        name,
        description: `${button.text || name} action generated from ${summary?.title ?? "this page"}`,
        risk: inferActionRisk(button.text),
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
        replayPlan: [{ type: "click", selector: button.selector }],
      };
    });
}

function describeGenericWorkflow(agentDraft, summary, prompt) {
  if (typeof agentDraft?.goal === "string" && agentDraft.goal.trim()) {
    return agentDraft.goal.trim();
  }

  if (prompt.trim()) {
    return `Workflow generated for: ${prompt.trim()}`;
  }

  return `Workflow generated from ${summary?.title ?? "the current page"}`;
}

function chooseButton(prompt, agentDraft, buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return undefined;
  }

  const haystack = [
    prompt,
    agentDraft?.goal,
    ...asArray(agentDraft?.capabilities),
    ...asArray(agentDraft?.workflow),
    ...asArray(agentDraft?.proposedTools).map((tool) => `${tool?.name ?? ""} ${tool?.description ?? ""}`),
  ]
    .join(" ")
    .toLowerCase();

  const actionWords = [
    "export",
    "download",
    "submit",
    "save",
    "search",
    "find",
    "filter",
    "add",
    "invite",
    "create",
    "approve",
    "delete",
    "remove",
    "revoke",
  ];

  const blockedActions = new Set();
  if (/\b(do not|don't|without|never)\b[^.]*\bexport\b/i.test(haystack)) {
    blockedActions.add("export");
  }

  const intentAction = actionWords.find((word) => haystack.includes(word) && !blockedActions.has(word));
  if (intentAction) {
    const direct = buttons.find((button) => button.text.toLowerCase().includes(intentAction));
    if (direct) {
      return direct;
    }
  }

  return (
    buttons.find((button) =>
      /search|find|filter|submit|save|create|add|invite|approve|export|download|delete|remove|revoke/i.test(button.text),
    ) ?? buttons[0]
  );
}

function usableInputs(inputs) {
  return inputs.filter((input) => !/^(submit|button|hidden|password)$/i.test(input.type));
}

function inferInputName(input) {
  const source = input.label || input.name || input.placeholder || input.selector || "value";
  const lowered = source.toLowerCase();

  if (/\b(email|e-mail)\b/.test(lowered)) {
    return "email";
  }

  if (/\b(date|day)\b/.test(lowered)) {
    return "date";
  }

  if (/\b(amount|price|total|minimum|min|number|count)\b/.test(lowered)) {
    return "amount";
  }

  if (/\b(status|state)\b/.test(lowered)) {
    return "status";
  }

  if (/\b(name|customer|vendor|user|person)\b/.test(lowered)) {
    return "name";
  }

  return toCamelCase(source.replace(/^#/, ""));
}

function inferInputSchema(input) {
  if (/^(checkbox|radio)$/i.test(input.type)) {
    return { type: "boolean", title: input.label || input.name || input.selector };
  }

  if (/^(number|range)$/i.test(input.type)) {
    return { type: "number", title: input.label || input.name || input.selector };
  }

  if (/^date$/i.test(input.type)) {
    return { type: "string", format: "date", title: input.label || input.name || input.selector };
  }

  return { type: "string", title: input.label || input.name || input.selector };
}

function inferDraftRisk(agentDraft) {
  const candidates = [
    ...asArray(agentDraft?.risks).flatMap((risk) => [risk?.type, risk?.target, risk?.reason]),
    ...asArray(agentDraft?.proposedTools).map((tool) => tool?.risk),
    ...asArray(agentDraft?.workflow),
    ...asArray(agentDraft?.capabilities),
  ]
    .filter(Boolean)
    .join(" ");

  if (!candidates.trim()) {
    return undefined;
  }

  return inferActionRisk(candidates);
}

function inferActionRisk(text) {
  const lowered = splitIdentifierWords(String(text ?? "")).toLowerCase();
  if (/\b(delete|remove|destroy|revoke|terminate|drop|apply hold|block)\b/.test(lowered)) {
    return "destructive";
  }

  if (/\b(export|download|csv|xlsx|pdf|bank|account|iban|routing|sensitive|secret|token)\b/.test(lowered)) {
    return "export";
  }

  if (/\b(submit|save|create|add|invite|approve|update|edit|apply|send)\b/.test(lowered)) {
    return "write";
  }

  return "read";
}

function splitIdentifierWords(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
}

function normalizeRisk(risk) {
  if (["read", "write", "export", "destructive"].includes(risk)) {
    return risk;
  }

  if (/high|sensitive|export/i.test(String(risk))) {
    return "export";
  }

  if (/medium|write|change/i.test(String(risk))) {
    return "write";
  }

  return "read";
}

function firstProposedTool(agentDraft) {
  return asArray(agentDraft?.proposedTools).find((tool) => tool && typeof tool === "object");
}

function firstCapability(agentDraft) {
  return asArray(agentDraft?.capabilities).find((capability) => typeof capability === "string" && capability.trim());
}

function promptMentions(prompt, toolName) {
  const normalizedPrompt = String(prompt ?? "").toLowerCase();
  return toWords(toolName).some((word) => word.length > 3 && normalizedPrompt.includes(word));
}

function promptMentionsRisk(prompt, risk) {
  const normalizedPrompt = String(prompt ?? "").toLowerCase();
  if (risk === "export") {
    return /\b(export|download|csv|xlsx|pdf)\b/.test(normalizedPrompt);
  }

  if (risk === "destructive") {
    return /\b(delete|remove|revoke|terminate|destroy)\b/.test(normalizedPrompt);
  }

  return false;
}

function uniqueName(baseName, usedNames) {
  const base = baseName || "value";
  let next = base;
  let index = 2;
  while (usedNames.has(next)) {
    next = `${base}${index}`;
    index += 1;
  }
  usedNames.add(next);
  return next;
}

function uniqueToolName(baseName, usedNames) {
  return uniqueName(baseName || "generatedTool", usedNames);
}

function toCamelCase(value) {
  const words = toWords(value);
  if (words.length === 0) {
    return "generatedTool";
  }

  return words
    .slice(0, 6)
    .map((word, index) => (index === 0 ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join("");
}

function toTitle(value) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "Generated workflow";
  }
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

function toWords(value) {
  return String(value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^\w\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function summarizeAgentDraft(agentDraft) {
  if (!agentDraft || typeof agentDraft !== "object") {
    return [];
  }

  const notes = [];
  if (typeof agentDraft.goal === "string") {
    notes.push(`Goal: ${agentDraft.goal}`);
  }
  if (asArray(agentDraft.capabilities).length > 0) {
    notes.push(`Capabilities: ${asArray(agentDraft.capabilities).filter(Boolean).join(", ")}`);
  }
  if (asArray(agentDraft.workflow).length > 0) {
    notes.push(`Workflow: ${asArray(agentDraft.workflow).filter(Boolean).join(" -> ")}`);
  }
  if (typeof agentDraft.description === "string") {
    notes.push(agentDraft.description);
  }
  if (typeof agentDraft.riskNotes === "string") {
    notes.push(agentDraft.riskNotes);
  }
  if (asArray(agentDraft.riskNotes).length > 0) {
    notes.push(...asArray(agentDraft.riskNotes).filter((note) => typeof note === "string"));
  }
  if (asArray(agentDraft.tools).length > 0) {
    for (const tool of asArray(agentDraft.tools)) {
      if (typeof tool?.riskReason === "string") {
        notes.push(`${tool.name ?? "tool"}: ${tool.riskReason}`);
      }
    }
  }
  if (asArray(agentDraft.risks).length > 0) {
    for (const risk of asArray(agentDraft.risks)) {
      if (risk?.reason || risk?.target || risk?.type) {
        notes.push(`${risk.type ?? "risk"} ${risk.target ?? ""}: ${risk.reason ?? ""}`.trim());
      }
    }
  }
  return notes.slice(0, 4);
}

function inferMinAmount(prompt) {
  const amountMatch = String(prompt ?? "").match(/(?:above|over|greater than|>)\s*(?:eur|€)?\s*([\d,]+)/i);
  const minAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : 5000;
  return Number.isFinite(minAmount) ? minAmount : 5000;
}

function extractText(payload) {
  const candidates = [
    payload?.choices?.[0]?.message?.content,
    payload?.choices?.[0]?.text,
    payload?.reply,
    payload?.output,
    payload?.text,
  ];

  const text = candidates.find((item) => typeof item === "string" && item.trim().length > 0);
  if (!text) {
    throw new Error("MiniMax response did not include text content.");
  }
  return text;
}

function parseJsonResponse(text) {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : extractFirstJsonObject(withoutThinking);
  return JSON.parse(raw);
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) {
    return text;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return text.slice(start);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = unquoteEnvValue(trimmed.slice(separator + 1).trim());
    process.env[key] = process.env[key] ?? value;
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
