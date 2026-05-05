export type Order = {
  id: string;
  date: string;
  customer: string;
  amount: number;
  status: "paid" | "pending" | "flagged";
};

export const mockOrders: Order[] = [
  { id: "AC-1042", date: "2026-04-03", customer: "Nordlicht GmbH", amount: 1280, status: "paid" },
  { id: "AC-1048", date: "2026-04-08", customer: "Maison Valette", amount: 2485, status: "pending" },
  { id: "AC-1051", date: "2026-04-14", customer: "Oslo Marine AS", amount: 975, status: "paid" },
  { id: "AC-1060", date: "2026-04-22", customer: "Rhein Metalworks", amount: 3310, status: "flagged" },
  { id: "AC-1068", date: "2026-04-29", customer: "Turing Textiles", amount: 760, status: "pending" },
  { id: "AC-1077", date: "2026-05-02", customer: "Iberia Logistics", amount: 1440, status: "paid" },
  { id: "AC-1019", date: "2026-03-18", customer: "Baltic Paper Co", amount: 2120, status: "paid" },
  { id: "AC-0998", date: "2026-02-24", customer: "Acme Components", amount: 420, status: "pending" },
];

export type Invoice = {
  invoiceId: string;
  vendorName: string;
  amount: number;
  dueDate: string;
  status: "overdue" | "pending" | "paid";
  riskFlag: "none" | "review" | "blocked";
  description: string;
  paymentTerms: string;
  bankAccountLast4: string;
  bankCountry: string;
};

export const mockInvoices: Invoice[] = [
  {
    invoiceId: "INV-24017",
    vendorName: "Nordlicht Components GmbH",
    amount: 12800,
    dueDate: "2026-04-12",
    status: "overdue",
    riskFlag: "review",
    description: "Quarterly control-board shipment for EU West warehouse",
    paymentTerms: "Net 30",
    bankAccountLast4: "8842",
    bankCountry: "DE",
  },
  {
    invoiceId: "INV-24031",
    vendorName: "Maison Valette Packaging",
    amount: 7600,
    dueDate: "2026-04-21",
    status: "overdue",
    riskFlag: "none",
    description: "Custom packaging materials for retail batch 19",
    paymentTerms: "Net 15",
    bankAccountLast4: "2190",
    bankCountry: "FR",
  },
  {
    invoiceId: "INV-24038",
    vendorName: "Oslo Marine Logistics",
    amount: 15450,
    dueDate: "2026-04-25",
    status: "overdue",
    riskFlag: "blocked",
    description: "Expedited freight charges for Nordic ports",
    paymentTerms: "Due on receipt",
    bankAccountLast4: "4417",
    bankCountry: "NO",
  },
  {
    invoiceId: "INV-24044",
    vendorName: "Rhein Metalworks",
    amount: 6950,
    dueDate: "2026-04-28",
    status: "overdue",
    riskFlag: "none",
    description: "Replacement conveyor brackets and installation hardware",
    paymentTerms: "Net 30",
    bankAccountLast4: "6621",
    bankCountry: "DE",
  },
  {
    invoiceId: "INV-24051",
    vendorName: "Turing Textiles",
    amount: 4200,
    dueDate: "2026-04-29",
    status: "overdue",
    riskFlag: "none",
    description: "Uniform fabric replenishment",
    paymentTerms: "Net 45",
    bankAccountLast4: "1092",
    bankCountry: "GB",
  },
  {
    invoiceId: "INV-24062",
    vendorName: "Iberia Facility Services",
    amount: 8700,
    dueDate: "2026-05-18",
    status: "pending",
    riskFlag: "review",
    description: "Preventive maintenance for Madrid facility",
    paymentTerms: "Net 30",
    bankAccountLast4: "7304",
    bankCountry: "ES",
  },
];
