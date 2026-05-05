import type { DomSummary, ToolSchema } from "./schemaTypes";
import { compileWithMiniMax, isMiniMaxConfigured } from "./minimaxClient";

const CACHE_KEY = "graftguard.schemas.acme-erp";

const queryOrdersSchema: ToolSchema = {
  name: "queryOrders",
  description: "Search Acme ERP orders by date range and minimum amount",
  risk: "read",
  inputSchema: {
    type: "object",
    properties: {
      startDate: {
        type: "string",
        format: "date",
        title: "Start date",
        default: "2026-04-01",
      },
      endDate: {
        type: "string",
        format: "date",
        title: "End date",
        default: "2026-04-30",
      },
      minAmount: {
        type: "number",
        title: "Minimum amount",
        default: 1000,
        minimum: 0,
        step: 1,
      },
    },
    required: ["startDate", "endDate", "minAmount"],
  },
  replayPlan: [
    { type: "setValue", selector: "#start-date", valueFrom: "startDate" },
    { type: "setValue", selector: "#end-date", valueFrom: "endDate" },
    { type: "setValue", selector: "#min-amount", valueFrom: "minAmount" },
    { type: "click", selector: "#search-orders" },
    { type: "extractTable", selector: "#orders-table" },
  ],
};

const exportCsvSchema: ToolSchema = {
  name: "exportCsv",
  description: "Export the current Acme ERP order table to CSV",
  risk: "export",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  replayPlan: [{ type: "click", selector: "#export-csv" }],
};

const searchInvoicesSchema: ToolSchema = {
  name: "searchInvoices",
  description: "Search overdue vendor invoices by minimum amount",
  risk: "read",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", title: "Status", default: "overdue" },
      minAmount: { type: "number", title: "Minimum amount", default: 5000, minimum: 0, step: 100 },
    },
    required: ["status", "minAmount"],
  },
  replayPlan: [
    { type: "click", selector: "#nav-invoices" },
    { type: "setValue", selector: "#invoice-min-amount", valueFrom: "minAmount" },
    { type: "click", selector: "#search-invoices" },
    { type: "extractTable", selector: "#invoices-table" },
  ],
};

const openInvoiceSchema: ToolSchema = {
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
};

const extractPaymentPacketSchema: ToolSchema = {
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
};

const exportBankDetailsSchema: ToolSchema = {
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
};

export const vendorPaymentSchemas = [
  searchInvoicesSchema,
  openInvoiceSchema,
  extractPaymentPacketSchema,
  exportBankDetailsSchema,
];

const hardcodedSchemas = [...vendorPaymentSchemas, queryOrdersSchema, exportCsvSchema];

export async function compileApp(domSummary: DomSummary): Promise<ToolSchema[]> {
  if (!domSummary.stableIds.includes("#invoices-table") && !domSummary.stableIds.includes("#orders-table")) {
    throw new Error("Acme ERP table was not found in the DOM summary.");
  }

  if (isMiniMaxConfigured()) {
    const schemas = await compileWithMiniMax(domSummary);
    localStorage.setItem(CACHE_KEY, JSON.stringify(schemas));
    return schemas;
  }

  await new Promise((resolve) => window.setTimeout(resolve, 350));
  localStorage.setItem(CACHE_KEY, JSON.stringify(hardcodedSchemas));
  return hardcodedSchemas;
}

export function loadCachedSchemas(): ToolSchema[] {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as ToolSchema[];
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return [];
  }
}

export function schemaSignature(schema: ToolSchema): string {
  if (schema.name === "queryOrders") {
    return "queryOrders(startDate: Date, endDate: Date, minAmount: Number): Order[]";
  }

  if (schema.name === "exportCsv") {
    return "exportCsv(): CsvFile";
  }

  if (schema.name === "searchInvoices") {
    return 'searchInvoices(status: "overdue", minAmount: Number): Invoice[]';
  }

  if (schema.name === "openInvoice") {
    return "openInvoice(invoiceId: String): InvoiceDetail";
  }

  if (schema.name === "extractPaymentPacket") {
    return "extractPaymentPacket(invoiceIds: String[]): PaymentPacket";
  }

  if (schema.name === "exportBankDetails") {
    return "exportBankDetails(invoiceIds: String[]): CsvFile";
  }

  const required = schema.inputSchema.required ?? [];
  const params = required.map((name) => `${name}: ${typeLabel(schema.inputSchema.properties[name])}`).join(", ");
  const result = schema.risk === "read" ? "Record[]" : "ActionResult";
  return `${schema.name}(${params}): ${result}`;
}

function typeLabel(property: unknown): string {
  if (
    property &&
    typeof property === "object" &&
    "type" in property &&
    typeof property.type === "string"
  ) {
    if (property.type === "number") {
      return "Number";
    }

    if (property.type === "boolean") {
      return "Boolean";
    }

    return "String";
  }

  return "unknown";
}
