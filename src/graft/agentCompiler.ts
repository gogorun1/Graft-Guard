import type { PageDomSummary } from "../extension/pageSummary";
import { configuredAgentProvider, miniMaxProxyUrl } from "./minimaxClient";
import type { ToolSchema } from "./schemaTypes";
import { vendorPaymentSchemas } from "./schemaCompiler";

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
};

type AgentCompilerResponse = Omit<CompiledToolGroup, "provider">;

export async function compileToolGroupWithAgent(input: AgentCompilerInput): Promise<CompiledToolGroup> {
  if (configuredAgentProvider() === "minimax" && miniMaxProxyUrl()) {
    try {
      const response = await callAgentCompiler(input);
      validateCompiledToolGroup(response);
      return { ...response, provider: "agent-api" };
    } catch (error) {
      return compileLocalVendorPaymentGroup(input, error);
    }
  }

  return compileLocalVendorPaymentGroup(input);
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

async function callAgentCompiler(input: AgentCompilerInput): Promise<AgentCompilerResponse> {
  const response = await fetch(`${miniMaxProxyUrl()}/compile-tool-group`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      pageSummary: input.pageSummary,
      model: import.meta.env.VITE_MINIMAX_MODEL,
    }),
  });

  if (!response.ok) {
    throw new Error(`Agent compiler failed: ${response.status}`);
  }

  return response.json() as Promise<AgentCompilerResponse>;
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
  }

  const bankTool = group.tools.find((tool) => tool.name === "exportBankDetails");
  if (!bankTool || bankTool.risk !== "export") {
    throw new Error("Agent compiler did not mark exportBankDetails as guarded export.");
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
