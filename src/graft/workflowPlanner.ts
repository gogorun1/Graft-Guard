import type { ToolSchema } from "./schemaTypes";

export type WorkflowRunInputs = {
  status: "overdue";
  minAmount: number;
  riskFilter: "all" | "low-risk-only";
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
    status: "overdue",
    minAmount: inferMinAmount(prompt) ?? current.minAmount,
    riskFilter: inferRiskFilter(prompt) ?? current.riskFilter,
  };
}

export function formatVendorPaymentPrompt(inputs: WorkflowRunInputs): string {
  const riskText =
    inputs.riskFilter === "low-risk-only"
      ? " Include only low-risk vendors."
      : "";

  return `Prepare a vendor payment packet for overdue invoices above EUR ${inputs.minAmount.toLocaleString("en-US")}, but do not export bank details without approval.${riskText}`;
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

function planMissingWorkflow(
  prompt: string,
  tools: ToolSchema[],
  inputs: WorkflowRunInputs,
  detail: { title: string; summary: string; missing: string[] },
): WorkflowTaskPlan {
  const reusableInvoiceTools = tools
    .filter((tool) => ["searchInvoices", "openInvoice", "extractPaymentPacket"].includes(tool.name))
    .map((tool) => tool.name);

  return {
    prompt,
    title: detail.title,
    summary: detail.summary,
    status: reusableInvoiceTools.length > 0 ? "partial" : "needs_tools",
    reusedTools: reusableInvoiceTools,
    guardedTools: tools.filter((tool) => tool.name === "exportBankDetails").map((tool) => tool.name),
    missingCapabilities: detail.missing,
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

function inferRiskFilter(prompt: string): WorkflowRunInputs["riskFilter"] | undefined {
  if (/\b(low[- ]risk|exclude high[- ]risk|only low[- ]risk)\b/i.test(prompt)) {
    return "low-risk-only";
  }

  if (/\b(all vendors|include flagged|include high[- ]risk)\b/i.test(prompt)) {
    return "all";
  }

  return undefined;
}

function mentionsCreditHold(prompt: string): boolean {
  return /\b(credit hold|hold recommendation|apply hold|customer debt)\b/.test(prompt);
}

function mentionsVendorApproval(prompt: string): boolean {
  return /\b(vendor onboarding|approve vendor|tax id|new vendors?)\b/.test(prompt);
}
