import { useMemo, useState } from "react";
import { mockInvoices, mockOrders, type Invoice, type Order } from "./mockOrders";

const initialResults = mockOrders.slice(0, 6);
const initialInvoices = mockInvoices.filter((invoice) => invoice.status === "overdue" && invoice.amount >= 5000);

export function DemoErp() {
  const [results, setResults] = useState<Order[]>(initialResults);
  const [activeSection, setActiveSection] = useState<"orders" | "invoices">("invoices");
  const [invoiceResults, setInvoiceResults] = useState<Invoice[]>(initialInvoices);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(initialInvoices[0]?.invoiceId);
  const total = useMemo(() => results.reduce((sum, order) => sum + order.amount, 0), [results]);
  const invoiceTotal = useMemo(
    () => invoiceResults.reduce((sum, invoice) => sum + invoice.amount, 0),
    [invoiceResults],
  );
  const selectedInvoice = invoiceResults.find((invoice) => invoice.invoiceId === selectedInvoiceId) ?? invoiceResults[0];

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

  function handleInvoiceSearch() {
    const status = (document.getElementById("invoice-status") as HTMLSelectElement | null)?.value ?? "overdue";
    const minAmount = Number(getInputValue("invoice-min-amount") || 0);

    const filtered = mockInvoices.filter((invoice) => {
      const matchesStatus = status === "all" || invoice.status === status;
      return matchesStatus && invoice.amount >= minAmount;
    });

    setInvoiceResults(filtered);
    setSelectedInvoiceId(filtered[0]?.invoiceId);
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
          <h1>Acme ERP Finance Console v3.2</h1>
          <span>Legacy Operations Console - EU West</span>
        </div>
        <div className="erp-led">ONLINE</div>
      </div>

      <div className="erp-toolbar">
        <button type="button" className={activeSection === "orders" ? "active-erp-tab" : ""} onClick={() => setActiveSection("orders")}>
          Orders
        </button>
        <button id="nav-invoices" type="button" className={activeSection === "invoices" ? "active-erp-tab" : ""} onClick={() => setActiveSection("invoices")}>
          Invoices
        </button>
        <button type="button">Customers</button>
        <button type="button">Batch Jobs</button>
      </div>

      {activeSection === "orders" ? (
        <>
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
        </>
      ) : (
        <>
          <div className="erp-form invoice-form">
            <label>
              Invoice status
              <select id="invoice-status" defaultValue="overdue">
                <option value="overdue">Overdue</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="all">All</option>
              </select>
            </label>
            <label>
              Minimum amount
              <input id="invoice-min-amount" type="number" min="0" step="100" defaultValue="5000" />
            </label>
            <button id="search-invoices" type="button" onClick={handleInvoiceSearch}>
              Search invoices
            </button>
            <button id="export-bank-details" type="button">
              Export bank details
            </button>
          </div>

          <div className="erp-summary">
            <span>{invoiceResults.length} invoices</span>
            <span>EUR {invoiceTotal.toLocaleString("en-US")}</span>
            <span>{invoiceResults.filter((invoice) => invoice.riskFlag !== "none").length} flagged</span>
          </div>

          <div className="invoice-workspace">
            <table id="invoices-table" className="orders-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Vendor</th>
                  <th>Amount</th>
                  <th>Due date</th>
                  <th>Risk</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {invoiceResults.map((invoice) => (
                  <tr key={invoice.invoiceId} className={selectedInvoice?.invoiceId === invoice.invoiceId ? "selected-row" : ""}>
                    <td>{invoice.invoiceId}</td>
                    <td>{invoice.vendorName}</td>
                    <td>EUR {invoice.amount.toLocaleString("en-US")}</td>
                    <td>{invoice.dueDate}</td>
                    <td>
                      <span className={`status-pill risk-${invoice.riskFlag}`}>{invoice.riskFlag}</span>
                    </td>
                    <td>
                      <button
                        id={`open-${invoice.invoiceId}`}
                        type="button"
                        className="table-action"
                        onClick={() => setSelectedInvoiceId(invoice.invoiceId)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <aside id="invoice-detail" className="invoice-detail" aria-label="Invoice detail">
              {selectedInvoice ? (
                <>
                  <div>
                    <span>Invoice detail</span>
                    <h2>{selectedInvoice.invoiceId}</h2>
                  </div>
                  <dl>
                    <div>
                      <dt>Vendor</dt>
                      <dd>{selectedInvoice.vendorName}</dd>
                    </div>
                    <div>
                      <dt>Amount</dt>
                      <dd>EUR {selectedInvoice.amount.toLocaleString("en-US")}</dd>
                    </div>
                    <div>
                      <dt>Due date</dt>
                      <dd>{selectedInvoice.dueDate}</dd>
                    </div>
                    <div>
                      <dt>Risk flag</dt>
                      <dd>{selectedInvoice.riskFlag}</dd>
                    </div>
                    <div>
                      <dt>Payment terms</dt>
                      <dd>{selectedInvoice.paymentTerms}</dd>
                    </div>
                    <div>
                      <dt>Bank details</dt>
                      <dd>
                        {selectedInvoice.bankCountry} account ending {selectedInvoice.bankAccountLast4}
                      </dd>
                    </div>
                  </dl>
                  <p>{selectedInvoice.description}</p>
                </>
              ) : (
                <div className="empty-state">No invoice selected.</div>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function getInputValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
}
