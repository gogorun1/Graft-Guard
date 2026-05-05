import { mockInvoices, type Invoice } from "../demo-erp/mockOrders";
import type { CompiledToolGroup, WorkflowPlanStep } from "./agentCompiler";
import type { WorkflowRunInputs } from "./workflowPlanner";

export type PaymentPacketInvoice = {
  invoiceId: string;
  vendorName: string;
  amount: number;
  dueDate: string;
  riskFlag: Invoice["riskFlag"];
  bankDetails: string;
};

export type PaymentPacket = {
  invoices: PaymentPacketInvoice[];
  totalAmount: number;
  flaggedVendors: string[];
  needsApproval: string[];
  bankDetailsStatus: "included" | "redacted";
};

export type VendorAgentEvent =
  | { type: "plan_selected"; tool: string; message: string }
  | { type: "tool_call"; tool: string; message: string }
  | { type: "tool_result"; tool: string; message: string }
  | { type: "guard_required"; tool: "exportBankDetails"; invoiceIds: string[]; message: string }
  | { type: "packet_generated"; packet: PaymentPacket; message: string };

export type VendorAgentRun = {
  events: VendorAgentEvent[];
  guardInvoiceIds?: string[];
  packet?: PaymentPacket;
};

export function parseVendorPaymentRequest(request: string): { status: WorkflowRunInputs["status"]; minAmount: number } {
  const amountMatch = request.match(/(?:above|over|greater than|>)\s*(?:eur|€)?\s*([\d,]+)/i);
  const minAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : 5000;
  return {
    status: inferInvoiceStatus(request),
    minAmount: Number.isFinite(minAmount) ? minAmount : 5000,
  };
}

export function startVendorPaymentWorkflow(request: string, inputs?: WorkflowRunInputs): VendorAgentRun {
  return runVendorPaymentSteps(
    [
      {
        tool: "searchInvoices",
      },
      { tool: "openInvoice", forEach: "searchInvoices.result" },
      { tool: "extractPaymentPacket", args: { invoiceIds: "$openedInvoices" } },
      { tool: "exportBankDetails", args: { invoiceIds: "$openedInvoices" }, guard: true },
    ],
    request,
    undefined,
    inputs,
  );
}

export function startCompiledVendorPaymentWorkflow(
  group: CompiledToolGroup,
  request: string,
  inputs?: WorkflowRunInputs,
): VendorAgentRun {
  return runVendorPaymentSteps(group.workflowPlan, request, group, inputs);
}

export function finishVendorPaymentWorkflow(invoiceIds: string[], includeBankDetails: boolean): VendorAgentRun {
  const invoices = invoiceIds.map((invoiceId) => openInvoice(invoiceId));
  const packet = buildPaymentPacket(invoices, includeBankDetails);

  return {
    packet,
    events: [
      {
        type: "tool_result",
        tool: "exportBankDetails",
        message: includeBankDetails ? "bank export approved" : "bank export denied",
      },
      {
        type: "packet_generated",
        packet,
        message: includeBankDetails
          ? "payment packet generated with bank details"
          : "payment packet generated with redactions",
      },
    ],
  };
}

function searchInvoices(
  status: WorkflowRunInputs["status"],
  minAmount: number,
  riskFilter: WorkflowRunInputs["riskFilter"],
): Invoice[] {
  return mockInvoices.filter(
    (invoice) =>
      (status === "all" || invoice.status === status) &&
      invoice.amount >= minAmount &&
      matchesRiskFilter(invoice.riskFlag, riskFilter),
  );
}

function matchesRiskFilter(
  riskFlag: Invoice["riskFlag"],
  riskFilter: WorkflowRunInputs["riskFilter"],
): boolean {
  if (riskFilter === "all") {
    return true;
  }

  if (riskFilter === "flagged") {
    return riskFlag !== "none";
  }

  return riskFlag === riskFilter;
}

function riskFilterSearchText(riskFilter: WorkflowRunInputs["riskFilter"]): string {
  const text: Record<WorkflowRunInputs["riskFilter"], string> = {
    all: "",
    none: " with clear vendors only",
    review: " with review-flagged vendors only",
    blocked: " with blocked vendors only",
    flagged: " with flagged vendors only",
  };

  return text[riskFilter];
}

function inferInvoiceStatus(request: string): WorkflowRunInputs["status"] {
  if (/\ball invoices?\b/i.test(request)) {
    return "all";
  }

  if (/\bpending invoices?\b/i.test(request)) {
    return "pending";
  }

  if (/\bpaid invoices?\b/i.test(request)) {
    return "paid";
  }

  return "overdue";
}

function openInvoice(invoiceId: string): Invoice {
  const invoice = mockInvoices.find((item) => item.invoiceId === invoiceId);
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }
  return invoice;
}

function buildPaymentPacket(invoices: Invoice[], includeBankDetails: boolean): PaymentPacket {
  return {
    invoices: invoices.map((invoice) => ({
      invoiceId: invoice.invoiceId,
      vendorName: invoice.vendorName,
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      riskFlag: invoice.riskFlag,
      bankDetails: includeBankDetails
        ? `${invoice.bankCountry} account ending ${invoice.bankAccountLast4}`
        : "redacted",
    })),
    totalAmount: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    flaggedVendors: invoices
      .filter((invoice) => invoice.riskFlag !== "none")
      .map((invoice) => invoice.vendorName),
    needsApproval: invoices
      .filter((invoice) => invoice.riskFlag !== "none")
      .map((invoice) => invoice.invoiceId),
    bankDetailsStatus: includeBankDetails ? "included" : "redacted",
  };
}

type VendorWorkflowState = {
  searchedInvoices: Invoice[];
  openedInvoices: Invoice[];
};

function runVendorPaymentSteps(
  steps: WorkflowPlanStep[],
  request: string,
  group?: CompiledToolGroup,
  inputs?: WorkflowRunInputs,
): VendorAgentRun {
  const events: VendorAgentEvent[] = [];
  const state: VendorWorkflowState = {
    searchedInvoices: [],
    openedInvoices: [],
  };

  if (group) {
    events.push({
      type: "plan_selected",
      tool: group.name,
      message: `Running ${group.workflowPlan.length} planned steps compiled by ${group.provider === "agent-api" ? "MiniMax" : "local fallback"}`,
    });
  }

  for (const step of steps) {
    if (step.guard && step.tool === "exportBankDetails") {
      const invoiceIds = resolveInvoiceIds(step, state);
      events.push({
        type: "guard_required",
        tool: "exportBankDetails",
        invoiceIds,
        message: `Bank details require approval for ${invoiceIds.length} invoices`,
      });
      return { events, guardInvoiceIds: invoiceIds };
    }

    runVendorTool(step, request, state, events, inputs);
  }

  return { events };
}

function runVendorTool(
  step: WorkflowPlanStep,
  request: string,
  state: VendorWorkflowState,
  events: VendorAgentEvent[],
  inputs?: WorkflowRunInputs,
): void {
  if (step.tool === "searchInvoices") {
    const args = searchInvoiceArgs(step, request, inputs);
    events.push({
      type: "tool_call",
      tool: "searchInvoices",
      message: `Searching ${args.status} invoices above EUR ${args.minAmount.toLocaleString("en-US")}${riskFilterSearchText(args.riskFilter)}`,
    });
    state.searchedInvoices = searchInvoices(args.status, args.minAmount, args.riskFilter);
    events.push({
      type: "tool_result",
      tool: "searchInvoices",
      message: `${state.searchedInvoices.length} invoices scanned`,
    });
    return;
  }

  if (step.tool === "openInvoice") {
    const invoiceIds = resolveInvoiceIds(step, state);
    events.push({
      type: "tool_call",
      tool: "openInvoice",
      message: `openInvoice for ${invoiceIds.length} invoices`,
    });
    state.openedInvoices = invoiceIds.map((invoiceId) => openInvoice(invoiceId));
    events.push({
      type: "tool_result",
      tool: "openInvoice",
      message: `${state.openedInvoices.length} invoice details opened`,
    });
    return;
  }

  if (step.tool === "extractPaymentPacket") {
    const invoiceIds = resolveInvoiceIds(step, state);
    events.push({
      type: "tool_call",
      tool: "extractPaymentPacket",
      message: `extractPaymentPacket(invoiceIds=${invoiceIds.join(",")})`,
    });
    const packet = buildPaymentPacket(invoiceIds.map((invoiceId) => openInvoice(invoiceId)), false);
    events.push({
      type: "tool_result",
      tool: "extractPaymentPacket",
      message: `payment packet prepared for EUR ${packet.totalAmount.toLocaleString("en-US")}; bank details pending Guard`,
    });
    return;
  }

  events.push({
    type: "tool_result",
    tool: step.tool,
    message: `Skipped unsupported vendor workflow tool: ${step.tool}`,
  });
}

function searchInvoiceArgs(
  step: WorkflowPlanStep,
  request: string,
  inputs?: WorkflowRunInputs,
): { status: WorkflowRunInputs["status"]; minAmount: number; riskFilter: WorkflowRunInputs["riskFilter"] } {
  const parsed = parseVendorPaymentRequest(request);
  const minAmount = numberArg(step.args?.minAmount) ?? inputs?.minAmount ?? parsed.minAmount;
  const status = statusArg(step.args?.status) ?? inputs?.status ?? parsed.status;
  const riskFilter = riskFilterArg(step.args?.riskFilter) ?? inputs?.riskFilter ?? "all";
  return { status, minAmount, riskFilter };
}

function resolveInvoiceIds(step: WorkflowPlanStep, state: VendorWorkflowState): string[] {
  const explicit = parseInvoiceIds(step.args?.invoiceIds);
  if (explicit.length > 0 && !explicit.some((invoiceId) => invoiceId.startsWith("$"))) {
    return explicit;
  }

  if (step.forEach === "searchInvoices.result") {
    return state.searchedInvoices.map((invoice) => invoice.invoiceId);
  }

  if (state.openedInvoices.length > 0) {
    return state.openedInvoices.map((invoice) => invoice.invoiceId);
  }

  return state.searchedInvoices.map((invoice) => invoice.invoiceId);
}

function parseInvoiceIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map((invoiceId) => invoiceId.trim()).filter(Boolean);
  }

  return [];
}

function numberArg(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function statusArg(value: unknown): WorkflowRunInputs["status"] | undefined {
  return value === "all" || value === "overdue" || value === "pending" || value === "paid"
    ? value
    : undefined;
}

function riskFilterArg(value: unknown): WorkflowRunInputs["riskFilter"] | undefined {
  return value === "all" ||
    value === "none" ||
    value === "review" ||
    value === "blocked" ||
    value === "flagged"
    ? value
    : undefined;
}
