# Graft Guard

Graft Guard compiles stable web workflows into typed, cached, guarded tools.

The current project has two modes:

- Standalone hackathon demo with the fake Acme ERP app.
- Chrome MV3 extension shell that can inspect the active page through a content script.

## Run Standalone Demo

```bash
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:5173/
```

Demo flow:

1. Click `Compile this app`.
2. Review the compiled vendor payment tool group:
   - `searchInvoices(status: "overdue", minAmount: Number): Invoice[]`
   - `openInvoice(invoiceId: String): InvoiceDetail`
   - `extractPaymentPacket(invoiceIds: String[]): PaymentPacket`
   - `exportBankDetails(invoiceIds: String[]): CsvFile`
3. Use the preset command:

```txt
Prepare payment packet for overdue invoices above 5000 euros.
```

4. Click `Run tool`.
5. Watch the agent workflow:
   - searches overdue invoices above EUR 5,000
   - opens invoice details
   - prepares a payment packet
   - reaches guarded bank details export
6. When Guard asks for approval, click `Deny`.
7. Confirm the workflow continues and generates a payment packet with bank details redacted.
8. Confirm audit shows business events such as:
   - invoices scanned
   - invoice details opened
   - bank export denied
   - payment packet generated with redactions

This is the primary hackathon demo. It shows Graft Guard as a governed agent workflow layer, not just a form replay script.

## Vendor Payment Demo Script

Use this 60-second path for live demos:

1. Open the standalone app.
2. Point out that Acme ERP defaults to the `Invoices` section.
3. Click `Compile this app`.
4. Show the four compiled tools in `Compiled tools`.
5. Run:

```txt
Prepare payment packet for overdue invoices above 5000 euros.
```

6. Let the workflow reach the Guard card:

```txt
exportBankDetails(invoiceIds: String[]): CsvFile
```

7. Click `Deny`.
8. Show the final packet:
   - total payment amount
   - flagged vendors
   - needs approval count
   - bank details marked `redacted`

The important product moment is that denying bank export does not cancel the whole workflow. The agent still completes the payment packet with redactions.

## Build Extension

```bash
npm run build
```

Load `dist/` as an unpacked extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select this repo's `dist/` directory.
5. Open a webpage and launch the Graft Guard side panel.
6. Click `Inspect active page`.

The extension shell currently collects:

- page title
- origin and URL fingerprint
- visible non-sensitive inputs
- buttons and links
- forms
- tables and headers

## MiniMax Provider Hook

Do not put MiniMax API keys in browser code.

The frontend expects a proxy when MiniMax is enabled:

```bash
VITE_AGENT_PROVIDER=minimax
VITE_MINIMAX_PROXY_URL=https://your-proxy.example.com
VITE_MINIMAX_MODEL=your-model-name
```

Expected proxy endpoints:

- `POST /compile`
- `POST /parse-command`

The proxy should own API keys, model selection, rate limits, retries, and provider logs. The extension keeps schema validation, approval, replay, and audit local.

## Current Scope

This is not a universal website automation product yet. The next target is stable internal web tools with form and table workflows.

Current implementation status:

- Acme ERP demo: working
- vendor invoice/payment packet demo: working
- deterministic vendor payment agent workflow: working
- guarded bank details export with redacted continuation: working
- typed schema compiler boundary: working with deterministic local output
- local replay: working for the Acme demo
- approval guard and audit log: working
- extension manifest/content script/background: working
- active page DOM summary: working
- workflow capture: not implemented yet
- generic schema compiler: not implemented yet
- active-tab replay from extension: not implemented yet
- per-site cache/versioning: not implemented yet
