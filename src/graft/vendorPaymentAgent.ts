import { mockInvoices, type Invoice } from "../demo-erp/mockOrders";
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
  const parsed = parseVendorPaymentRequest(request);
  const status = inputs?.status ?? parsed.status;
  const minAmount = inputs?.minAmount ?? parsed.minAmount;
  const riskFilter = inputs?.riskFilter ?? "all";
  const invoices = searchInvoices(status, minAmount, riskFilter);
  const details = invoices.map((invoice) => openInvoice(invoice.invoiceId));
  const invoiceIds = details.map((invoice) => invoice.invoiceId);

  return {
    guardInvoiceIds: invoiceIds,
    events: [
      {
        type: "tool_call",
        tool: "searchInvoices",
        message: `Searching ${status} invoices above EUR ${minAmount.toLocaleString("en-US")}${riskFilter === "low-risk-only" ? " with low-risk vendors only" : ""}`,
      },
      {
        type: "tool_result",
        tool: "searchInvoices",
        message: `${invoices.length} invoices scanned`,
      },
      {
        type: "tool_call",
        tool: "openInvoice",
        message: `Opening ${details.length} invoice details`,
      },
      {
        type: "tool_result",
        tool: "openInvoice",
        message: `${details.length} invoice details opened`,
      },
      {
        type: "tool_call",
        tool: "extractPaymentPacket",
        message: "Preparing payment packet summary",
      },
      {
        type: "guard_required",
        tool: "exportBankDetails",
        invoiceIds,
        message: `Bank details require approval for ${invoiceIds.length} invoices`,
      },
    ],
  };
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
      (riskFilter === "all" || invoice.riskFlag === "none"),
  );
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
