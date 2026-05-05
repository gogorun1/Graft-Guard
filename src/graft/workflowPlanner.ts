import type { ToolSchema } from "./schemaTypes";
import type { PageDomSummary } from "../extension/pageSummary";
import type { WorkflowPlanStep } from "./agentCompiler";
import { configuredAgentProvider, miniMaxProxyUrl } from "./minimaxClient";

export type WorkflowRunInputs = {
  status: "all" | "overdue" | "pending" | "paid";
  minAmount: number;
  riskFilter: "all" | "none" | "review" | "blocked" | "flagged";
};

export type WorkflowTaskPlan = {
  prompt: string;
  title: string;
  summary: string;
  status: "needs_tools" | "ready" | "partial";
  reusedTools: string[];
  guardedTools: string[];
  missingCapabilities: string[];
  inputs: WorkflowRunInputs;
};

export type AgentTaskPlannerInput = {
  prompt: string;
  tools: ToolSchema[];
  inputs: WorkflowRunInputs;
  pageSummary?: PageDomSummary;
  workflowPlan?: WorkflowPlanStep[];
};

const defaultTaskPlannerTimeoutMs = 12000;

const vendorPaymentTools = [
  "searchInvoices",
  "openInvoice",
  "extractPaymentPacket",
  "exportBankDetails",
];

export function defaultWorkflowRunInputs(): WorkflowRunInputs {
  return {
    status: "overdue",
    minAmount: 5000,
    riskFilter: "all",
  };
}

export function inferWorkflowRunInputs(prompt: string, current = defaultWorkflowRunInputs()): WorkflowRunInputs {
  return {
    status: inferInvoiceStatus(prompt) ?? current.status,
    minAmount: inferMinAmount(prompt) ?? current.minAmount,
    riskFilter: inferRiskFilter(prompt) ?? current.riskFilter,
  };
}

export function formatVendorPaymentPrompt(inputs: WorkflowRunInputs): string {
  const statusText = inputs.status === "all" ? "all invoices" : `${inputs.status} invoices`;
  const riskText = riskFilterPromptText(inputs.riskFilter);

  return `Prepare a vendor payment packet for ${statusText} above EUR ${inputs.minAmount.toLocaleString("en-US")}, but do not export bank details without approval.${riskText}`;
}

export function planWorkflowTask(
  prompt: string,
  tools: ToolSchema[],
  inputs: WorkflowRunInputs,
): WorkflowTaskPlan {
  const toolNames = new Set(tools.map((tool) => tool.name));
  const promptText = prompt.trim();
  const normalized = promptText.toLowerCase();
  const requestedVendorPacket =
    !promptText ||
    /\b(payment packet|invoice|vendor|bank details|overdue)\b/.test(normalized);

  if (!tools.length) {
    return {
      prompt,
      title: "No saved tools yet",
      summary: "Compile this website before planning a run.",
      status: "needs_tools",
      reusedTools: [],
      guardedTools: [],
      missingCapabilities: ["compile website tools"],
      inputs,
    };
  }

  if (mentionsCreditHold(normalized)) {
    return planMissingWorkflow(prompt, tools, inputs, {
      title: "Credit hold review",
      summary: "Existing invoice tools can inspect invoices, but the credit-hold capability is missing.",
      missing: ["searchCustomersWithDebt", "checkRecentOrders", "draftCreditHoldRecommendation"],
    });
  }

  if (mentionsVendorApproval(normalized)) {
    return planMissingWorkflow(prompt, tools, inputs, {
      title: "Vendor onboarding review",
      summary: "Existing payment tools can inspect vendors indirectly, but onboarding approval tools are missing.",
      missing: ["searchVendors", "extractMissingFields", "approveVendor"],
    });
  }

  if (requestedVendorPacket) {
    const missing = vendorPaymentTools.filter((tool) => !toolNames.has(tool));
    const reused = vendorPaymentTools.filter((tool) => toolNames.has(tool));
    const guarded = toolNames.has("exportBankDetails") ? ["exportBankDetails"] : [];

    return {
      prompt,
      title: "Vendor payment packet",
      summary:
        missing.length > 0
          ? `Can reuse ${reused.length} tools, but needs ${missing.length} more capability.`
          : `Ready to run with ${reused.length} saved tools.`,
      status: missing.length > 0 ? "partial" : "ready",
      reusedTools: reused,
      guardedTools: guarded,
      missingCapabilities: missing,
      inputs,
    };
  }

  return {
    prompt,
    title: "New workflow",
    summary: "No matching saved workflow found. Compile or record the missing capability.",
    status: "partial",
    reusedTools: tools.slice(0, 3).map((tool) => tool.name),
    guardedTools: tools.filter((tool) => tool.risk === "export" || tool.risk === "destructive").map((tool) => tool.name),
    missingCapabilities: ["workflow planner for this task"],
    inputs,
  };
}

export async function planWorkflowTaskWithAgent(input: AgentTaskPlannerInput): Promise<WorkflowTaskPlan> {
  const fallback = planWorkflowTask(input.prompt, input.tools, input.inputs);
  if (configuredAgentProvider() !== "minimax" || !miniMaxProxyUrl()) {
    return fallback;
  }

  const timeoutMs = taskPlannerTimeoutMs();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${miniMaxProxyUrl()}/plan-workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: input.prompt,
        tools: summarizeTools(input.tools),
        inputs: input.inputs,
        pageSummary: input.pageSummary,
        workflowPlan: input.workflowPlan ?? [],
        fallback,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Agent task planner failed: ${response.status}`);
    }

    return normalizeTaskPlan((await response.json()) as Partial<WorkflowTaskPlan>, fallback, input);
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizeTaskPlan(
  candidate: Partial<WorkflowTaskPlan>,
  fallback: WorkflowTaskPlan,
  input: AgentTaskPlannerInput,
): WorkflowTaskPlan {
  const toolNames = new Set(input.tools.map((tool) => tool.name));
  const reusedTools = stringArray(candidate.reusedTools).filter((tool) => toolNames.has(tool));
  const guardedTools = stringArray(candidate.guardedTools).filter((tool) => toolNames.has(tool));
  const missingCapabilities = stringArray(candidate.missingCapabilities);
  const status =
    candidate.status === "ready" || candidate.status === "partial" || candidate.status === "needs_tools"
      ? candidate.status
      : missingCapabilities.length > 0
        ? reusedTools.length > 0
          ? "partial"
          : "needs_tools"
        : "ready";

  return {
    prompt: input.prompt,
    title: nonEmptyString(candidate.title) ?? fallback.title,
    summary: nonEmptyString(candidate.summary) ?? fallback.summary,
    status,
    reusedTools: reusedTools.length > 0 ? reusedTools : fallback.reusedTools,
    guardedTools: guardedTools.length > 0 ? guardedTools : fallback.guardedTools,
    missingCapabilities,
    inputs: input.inputs,
  };
}

function summarizeTools(tools: ToolSchema[]): Array<Pick<ToolSchema, "name" | "description" | "risk">> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    risk: tool.risk,
  }));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function taskPlannerTimeoutMs(): number {
  const configured = Number(import.meta.env.VITE_AGENT_TASK_PLAN_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultTaskPlannerTimeoutMs;
}

function planMissingWorkflow(
  prompt: string,
  tools: ToolSchema[],
  inputs: WorkflowRunInputs,
  detail: { title: string; summary: string; missing: string[] },
): WorkflowTaskPlan {
  const toolNames = new Set(tools.map((tool) => tool.name));
  const reusableInvoiceTools = tools
    .filter((tool) => ["searchInvoices", "openInvoice", "extractPaymentPacket"].includes(tool.name))
    .map((tool) => tool.name);
  const missing = detail.missing.filter((tool) => !toolNames.has(tool));
  const newlyCovered = detail.missing.filter((tool) => toolNames.has(tool));
  const reusedTools = [...reusableInvoiceTools, ...newlyCovered];

  return {
    prompt,
    title: detail.title,
    summary:
      missing.length > 0
        ? detail.summary
        : `Ready to run with ${reusedTools.length} saved tools.`,
    status: missing.length > 0 ? (reusableInvoiceTools.length > 0 ? "partial" : "needs_tools") : "ready",
    reusedTools,
    guardedTools: tools.filter((tool) => tool.name === "exportBankDetails").map((tool) => tool.name),
    missingCapabilities: missing,
    inputs,
  };
}

function inferMinAmount(prompt: string): number | undefined {
  const amountMatch = prompt.match(/(?:above|over|greater than|>|min(?:imum)?(?: amount)?(?: is)?|at least)\s*(?:eur|€)?\s*([\d,]+)/i);
  if (!amountMatch) {
    return undefined;
  }

  const amount = Number(amountMatch[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : undefined;
}

function inferInvoiceStatus(prompt: string): WorkflowRunInputs["status"] | undefined {
  if (/\ball invoices?\b/i.test(prompt)) {
    return "all";
  }

  if (/\boverdue invoices?\b/i.test(prompt)) {
    return "overdue";
  }

  if (/\bpending invoices?\b/i.test(prompt)) {
    return "pending";
  }

  if (/\bpaid invoices?\b/i.test(prompt)) {
    return "paid";
  }

  return undefined;
}

function inferRiskFilter(prompt: string): WorkflowRunInputs["riskFilter"] | undefined {
  if (/\b(low[- ]risk|clear vendors?|no risk|risk flag none|exclude flagged|exclude high[- ]risk|only low[- ]risk)\b/i.test(prompt)) {
    return "none";
  }

  if (/\b(review vendors?|manual review|risk flag review)\b/i.test(prompt)) {
    return "review";
  }

  if (/\b(blocked vendors?|risk flag blocked|blocked only)\b/i.test(prompt)) {
    return "blocked";
  }

  if (/\b(flagged vendors?|include flagged|review or blocked|high[- ]risk)\b/i.test(prompt)) {
    return "flagged";
  }

  if (/\b(all vendors|all risk|any risk)\b/i.test(prompt)) {
    return "all";
  }

  return undefined;
}

function riskFilterPromptText(riskFilter: WorkflowRunInputs["riskFilter"]): string {
  const text: Record<WorkflowRunInputs["riskFilter"], string> = {
    all: "",
    none: " Include only vendors with no risk flag.",
    review: " Include only vendors flagged for review.",
    blocked: " Include only blocked vendors.",
    flagged: " Include only flagged vendors.",
  };

  return text[riskFilter];
}

function mentionsCreditHold(prompt: string): boolean {
  return /\b(credit hold|hold recommendation|apply hold|customer debt)\b/.test(prompt);
}

function mentionsVendorApproval(prompt: string): boolean {
  return /\b(vendor onboarding|approve vendor|tax id|new vendors?)\b/.test(prompt);
}
