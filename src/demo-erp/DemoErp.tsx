import { useMemo, useState } from "react";
import { mockOrders, type Order } from "./mockOrders";

const initialResults = mockOrders.slice(0, 6);

export function DemoErp() {
  const [results, setResults] = useState<Order[]>(initialResults);
  const total = useMemo(() => results.reduce((sum, order) => sum + order.amount, 0), [results]);

  function handleSearch() {
    const startDate = getInputValue("start-date");
    const endDate = getInputValue("end-date");
    const minAmount = Number(getInputValue("min-amount") || 0);
    const customerName = getInputValue("customer-name").toLowerCase();

    const filtered = mockOrders.filter((order) => {
      const inDateRange = (!startDate || order.date >= startDate) && (!endDate || order.date <= endDate);
      const meetsAmount = order.amount >= minAmount;
      const matchesCustomer = !customerName || order.customer.toLowerCase().includes(customerName);
      return inDateRange && meetsAmount && matchesCustomer;
    });

    setResults(filtered);
  }

  function handleExport() {
    const headers = ["id", "date", "customer", "amount", "status"];
    const rows = results.map((order) => headers.map((header) => String(order[header as keyof Order])).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "acme-orders.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="erp-shell" aria-label="Acme ERP demo app">
      <div className="erp-titlebar">
        <div>
          <h1>Acme ERP Order Management v3.2</h1>
          <span>Legacy Operations Console - EU West</span>
        </div>
        <div className="erp-led">ONLINE</div>
      </div>

      <div className="erp-toolbar">
        <button type="button">Orders</button>
        <button type="button">Invoices</button>
        <button type="button">Customers</button>
        <button type="button">Batch Jobs</button>
      </div>

      <div className="erp-form">
        <label>
          Start date
          <input id="start-date" type="date" defaultValue="2026-04-01" />
        </label>
        <label>
          End date
          <input id="end-date" type="date" defaultValue="2026-04-30" />
        </label>
        <label>
          Min amount
          <input id="min-amount" type="number" min="0" step="1" defaultValue="0" />
        </label>
        <label>
          Customer name
          <input id="customer-name" type="text" placeholder="optional" />
        </label>
        <button id="search-orders" type="button" onClick={handleSearch}>
          Search
        </button>
        <button id="export-csv" type="button" onClick={handleExport}>
          Export CSV
        </button>
      </div>

      <div className="erp-summary">
        <span>{results.length} records</span>
        <span>EUR {total.toLocaleString("en-US")}</span>
        <span>Cache node: erp-db-03</span>
      </div>

      <table id="orders-table" className="orders-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.date}</td>
              <td>{order.customer}</td>
              <td>EUR {order.amount.toLocaleString("en-US")}</td>
              <td>
                <span className={`status-pill status-${order.status}`}>{order.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function getInputValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
}
