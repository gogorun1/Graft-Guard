import type { PageDomSummary } from "../extension/pageSummary";
import { configuredAgentProvider, miniMaxProxyUrl } from "./minimaxClient";
import type { ToolSchema } from "./schemaTypes";
import { vendorPaymentSchemas } from "./schemaCompiler";
import { compileWebsiteIntent } from "./websiteIntentCompiler";

export type WorkflowPlanStep = {
  tool: string;
  args?: Record<string, unknown>;
  forEach?: string;
  guard?: boolean;
};

export type CompiledToolGroup = {
  name: string;
  description: string;
  tools: ToolSchema[];
  workflowPlan: WorkflowPlanStep[];
  riskNotes: string[];
  provider: "agent-api" | "local-fallback";
};

export type AgentCompilerInput = {
  prompt: string;
  pageSummary: PageDomSummary;
  existingTools?: ToolSchema[];
  missingCapabilities?: string[];
};

type AgentCompilerResponse = Omit<CompiledToolGroup, "provider">;
const defaultAgentCompilerTimeoutMs = 20000;

export async function compileToolGroupWithAgent(input: AgentCompilerInput): Promise<CompiledToolGroup> {
  if (configuredAgentProvider() === "minimax" && miniMaxProxyUrl()) {
    try {
      const response = await callAgentCompiler(input);
      validateCompiledToolGroup(response);
      return { ...dedupeExistingTools(response, input), provider: "agent-api" };
    } catch (error) {
      return compileLocalToolGroup(input, error);
    }
  }

  return compileLocalToolGroup(input);
}

export function isVendorPaymentPage(summary: PageDomSummary): boolean {
  const selectors = new Set([
    ...summary.inputs.map((input) => input.selector),
    ...summary.buttons.map((button) => button.selector),
    ...summary.tables.map((table) => table.selector),
  ]);

  return (
    selectors.has("#invoice-min-amount") &&
    selectors.has("#search-invoices") &&
    selectors.has("#invoices-table") &&
    selectors.has("#export-bank-details")
  );
}

export function compileLocalVendorPaymentGroup(
  input: AgentCompilerInput,
  fallbackReason?: unknown,
): CompiledToolGroup {
  const reason =
    fallbackReason instanceof Error
      ? `Agent API fallback: ${fallbackReason.message}`
      : "Local deterministic vendor workflow compiler";

  if (input.missingCapabilities?.length) {
    return compileLocalMissingCapabilityGroup(input, reason);
  }

  return {
    name: "Vendor payment workflow",
    description: "Prepare a guarded payment packet from overdue vendor invoices.",
    tools: vendorPaymentSchemas,
    workflowPlan: [
      {
        tool: "searchInvoices",
        args: { status: "overdue", minAmount: inferMinAmount(input.prompt) },
      },
      { tool: "openInvoice", forEach: "searchInvoices.result" },
      { tool: "extractPaymentPacket", args: { invoiceIds: "$openedInvoices" } },
      { tool: "exportBankDetails", args: { invoiceIds: "$openedInvoices" }, guard: true },
    ],
    riskNotes: [
      reason,
      "exportBankDetails exposes vendor bank/account data and must be guarded.",
    ],
    provider: "local-fallback",
  };
}

function compileLocalToolGroup(
  input: AgentCompilerInput,
  fallbackReason?: unknown,
): CompiledToolGroup {
  if (input.missingCapabilities?.length) {
    return compileLocalMissingCapabilityGroup(input, fallbackReason);
  }

  if (isVendorPaymentPage(input.pageSummary)) {
    return compileLocalVendorPaymentGroup(input, fallbackReason);
  }

  const candidate = compileWebsiteIntent(input.prompt, input.pageSummary);
  const reason =
    fallbackReason instanceof Error
      ? `Agent API fallback: ${fallbackReason.message}`
      : "Local deterministic website workflow compiler";

  return {
    name: `${candidate.schema.name} workflow`,
    description: candidate.schema.description,
    tools: [candidate.schema],
    workflowPlan: [{ tool: candidate.schema.name }],
    riskNotes: [reason, ...candidate.warnings],
    provider: "local-fallback",
  };
}

async function callAgentCompiler(input: AgentCompilerInput): Promise<AgentCompilerResponse> {
  const timeoutMs = compilerTimeoutMs();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${miniMaxProxyUrl()}/compile-tool-group`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: input.prompt,
        pageSummary: input.pageSummary,
        existingTools: summarizeExistingTools(input.existingTools ?? []),
        missingCapabilities: input.missingCapabilities ?? [],
        model: import.meta.env.VITE_MINIMAX_MODEL,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Agent compiler timed out after ${Math.round(timeoutMs / 1000)}s`);
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Agent compiler failed: ${response.status}`);
  }

  return response.json() as Promise<AgentCompilerResponse>;
}

function compilerTimeoutMs(): number {
  const configured = Number(import.meta.env.VITE_AGENT_COMPILE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultAgentCompilerTimeoutMs;
}

function dedupeExistingTools(
  group: AgentCompilerResponse,
  input: AgentCompilerInput,
): AgentCompilerResponse {
  const existingNames = new Set((input.existingTools ?? []).map((tool) => tool.name));
  if (existingNames.size === 0) {
    return group;
  }

  const nextTools = group.tools.filter((tool) => !existingNames.has(tool.name));
  return {
    ...group,
    tools: nextTools,
    riskNotes: [
      ...(group.riskNotes ?? []),
      `Preserved ${existingNames.size} existing tools and ignored same-name regenerated tools.`,
    ],
  };
}

function summarizeExistingTools(tools: ToolSchema[]): Array<Pick<ToolSchema, "name" | "description" | "risk">> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    risk: tool.risk,
  }));
}

function compileLocalMissingCapabilityGroup(
  input: AgentCompilerInput,
  fallbackReason?: unknown,
): CompiledToolGroup {
  const reason =
    fallbackReason instanceof Error
      ? `Agent API fallback: ${fallbackReason.message}`
      : "Local deterministic missing-capability compiler";
  const tools = (input.missingCapabilities ?? []).map(toolForMissingCapability);

  return {
    name: "Missing capability compile",
    description: "Compile only capabilities not covered by saved tools.",
    tools,
    workflowPlan: tools.map((tool) => ({
      tool: tool.name,
      guard: tool.risk === "export" || tool.risk === "destructive",
    })),
    riskNotes: [
      reason,
      "Existing same-name tools are preserved by the client merge step.",
    ],
    provider: "local-fallback",
  };
}

function toolForMissingCapability(name: string): ToolSchema {
  const risk = /^(apply|approve|delete|remove|revoke)/i.test(name)
    ? "destructive"
    : /export|download|bank/i.test(name)
      ? "export"
      : /^(draft|create|submit|save|update)/i.test(name)
        ? "write"
        : "read";

  return {
    name,
    description: `${name} generated as a missing workflow capability`,
    risk,
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string", title: "Target ID" },
      },
      required: risk === "read" ? [] : ["targetId"],
    },
    replayPlan: risk === "read" && name.startsWith("search")
      ? [{ type: "extractTable", selector: "#invoices-table" }]
      : [],
  };
}

function validateCompiledToolGroup(group: AgentCompilerResponse): void {
  if (!group.name || !Array.isArray(group.tools) || group.tools.length === 0) {
    throw new Error("Agent compiler returned an empty tool group.");
  }

  const toolNames = new Set(group.tools.map((tool) => tool.name));
  for (const tool of group.tools) {
    if (!tool.name || !tool.risk || !tool.inputSchema || !Array.isArray(tool.replayPlan)) {
      throw new Error(`Invalid tool schema from agent compiler: ${tool.name || "(unnamed)"}`);
    }

    if (!["read", "write", "export", "destructive"].includes(tool.risk)) {
      throw new Error(`Invalid risk level from agent compiler: ${tool.risk}`);
    }

    if (tool.name === "exportBankDetails" && tool.risk !== "export") {
      throw new Error("Agent compiler did not mark exportBankDetails as guarded export.");
    }
  }

  for (const step of group.workflowPlan ?? []) {
    if (!toolNames.has(step.tool)) {
      throw new Error(`Workflow references unknown tool: ${step.tool}`);
    }
  }
}

function inferMinAmount(prompt: string): number {
  const amountMatch = prompt.match(/(?:above|over|greater than|>)\s*(?:eur|€)?\s*([\d,]+)/i);
  const minAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : 5000;
  return Number.isFinite(minAmount) ? minAmount : 5000;
}
