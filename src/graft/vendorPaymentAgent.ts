import { mockInvoices, type Invoice } from "../demo-erp/mockOrders";
import type { CompiledToolGroup, WorkflowPlanStep } from "./agentCompiler";

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

export function parseVendorPaymentRequest(request: string): { status: "overdue"; minAmount: number } {
  const amountMatch = request.match(/(?:above|over|greater than|>)\s*(?:eur|€)?\s*([\d,]+)/i);
  const minAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : 5000;
  return { status: "overdue", minAmount: Number.isFinite(minAmount) ? minAmount : 5000 };
}

export function startVendorPaymentWorkflow(request: string): VendorAgentRun {
  const { minAmount, status } = parseVendorPaymentRequest(request);

  return runVendorPaymentSteps(
    [
      {
        tool: "searchInvoices",
        args: { status, minAmount },
      },
      { tool: "openInvoice", forEach: "searchInvoices.result" },
      { tool: "extractPaymentPacket", args: { invoiceIds: "$openedInvoices" } },
      { tool: "exportBankDetails", args: { invoiceIds: "$openedInvoices" }, guard: true },
    ],
    request,
  );
}

export function startCompiledVendorPaymentWorkflow(group: CompiledToolGroup, request: string): VendorAgentRun {
  return runVendorPaymentSteps(group.workflowPlan, request, group);
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

function searchInvoices(status: "overdue", minAmount: number): Invoice[] {
  return mockInvoices.filter((invoice) => invoice.status === status && invoice.amount >= minAmount);
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

    runVendorTool(step, request, state, events);
  }

  return { events };
}

function runVendorTool(
  step: WorkflowPlanStep,
  request: string,
  state: VendorWorkflowState,
  events: VendorAgentEvent[],
): void {
  if (step.tool === "searchInvoices") {
    const args = searchInvoiceArgs(step, request);
    events.push({
      type: "tool_call",
      tool: "searchInvoices",
      message: `searchInvoices(status=${args.status}, minAmount=${args.minAmount})`,
    });
    state.searchedInvoices = searchInvoices(args.status, args.minAmount);
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
): { status: "overdue"; minAmount: number } {
  const parsed = parseVendorPaymentRequest(request);
  const minAmount = numberArg(step.args?.minAmount) ?? parsed.minAmount;
  const status = step.args?.status === "overdue" ? "overdue" : parsed.status;
  return { status, minAmount };
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
