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
