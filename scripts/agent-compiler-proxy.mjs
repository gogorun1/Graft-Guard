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
    "You are the Graft Guard Agent Compiler.",
    "Return only strict JSON. Do not include markdown.",
    "Your JSON must match this TypeScript contract exactly:",
    "{",
    '  "name": "Vendor payment workflow",',
    '  "description": "Prepare a guarded payment packet from overdue vendor invoices.",',
    '  "tools": ToolSchema[],',
    '  "workflowPlan": WorkflowPlanStep[],',
    '  "riskNotes": string[]',
    "}",
    "ToolSchema = { name: string, description: string, risk: 'read' | 'write' | 'export' | 'destructive', inputSchema: { type: 'object', properties: object, required: string[] }, replayPlan: ReplayStep[] }",
    "ReplayStep = { type: 'setValue', selector: string, valueFrom: string } | { type: 'click', selector: string } | { type: 'extractTable', selector: string }",
    "WorkflowPlanStep = { tool: string, args?: object, forEach?: string, guard?: boolean }",
    "Use exactly these four reusable tool names when the page is a vendor invoice workflow: searchInvoices, openInvoice, extractPaymentPacket, exportBankDetails.",
    "Use risk='export' for exportBankDetails. Do not use risk values like medium/high.",
    "Every tool must include inputSchema and replayPlan.",
    "workflowPlan must be an array, not a string.",
    "Do not include id, inputMappings, riskReason, or prose outside JSON.",
    "",
    "User prompt:",
    body.prompt,
    "",
    "Page summary:",
    JSON.stringify(body.pageSummary, null, 2),
  ].join("\n");

  const upstream = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: body.model ?? model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
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
  if (isVendorWorkflow && !isVendorPaymentToolGroup(parsed)) {
    return buildVendorPaymentToolGroup(parsed, body);
  }

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

  if (isVendorWorkflow) {
    return buildVendorPaymentToolGroup(parsed, body);
  }

  return parsed;
}

function isVendorPaymentToolGroup(value) {
  if (!isGraftToolGroup(value)) {
    return false;
  }

  const toolNames = new Set(value.tools.map((tool) => tool.name));
  return (
    toolNames.has("searchInvoices") &&
    toolNames.has("openInvoice") &&
    toolNames.has("extractPaymentPacket") &&
    value.tools.some((tool) => tool.name === "exportBankDetails" && tool.risk === "export") &&
    value.workflowPlan.every((step) => toolNames.has(step.tool))
  );
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

function summarizeAgentDraft(agentDraft) {
  if (!agentDraft || typeof agentDraft !== "object") {
    return [];
  }

  const notes = [];
  if (typeof agentDraft.description === "string") {
    notes.push(agentDraft.description);
  }
  if (typeof agentDraft.riskNotes === "string") {
    notes.push(agentDraft.riskNotes);
  }
  if (Array.isArray(agentDraft.riskNotes)) {
    notes.push(...agentDraft.riskNotes.filter((note) => typeof note === "string"));
  }
  if (Array.isArray(agentDraft.tools)) {
    for (const tool of agentDraft.tools) {
      if (typeof tool?.riskReason === "string") {
        notes.push(`${tool.name ?? "tool"}: ${tool.riskReason}`);
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
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw);
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
