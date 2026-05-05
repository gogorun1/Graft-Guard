# Graft Guard

Graft Guard compiles stable web workflows into typed, cached, guarded tools.

The current project has two surfaces:

- Standalone Acme ERP website, which is only the legacy target app.
- Chrome MV3 extension side panel, which is the Graft Guard product UI.

## Run Standalone ERP Target

```bash
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:5173/
```

The standalone page intentionally has no Graft Guard sidebar. It should look like a plain legacy ERP app. Acme ERP defaults to the `Invoices` section with overdue vendor invoices and bank details.

## Vendor Payment Demo Script

Use this 60-second path for live demos:

1. Run the standalone ERP target.
2. Build and load the Chrome extension from `dist/`.
3. Open the Graft Guard side panel on the ERP page.
4. Keep the default prompt:

```txt
Prepare a vendor payment packet for all overdue invoices above EUR 5,000, but do not export bank details without approval.
```

5. Click `Confirm and compile`.
6. Show the compiled workflow:
   - provider: `Agent API` if the proxy is configured, otherwise `local fallback`
   - `searchInvoices(status: "overdue", minAmount: Number): Invoice[]`
   - `openInvoice(invoiceId: String): InvoiceDetail`
   - `extractPaymentPacket(invoiceIds: String[]): PaymentPacket`
   - `exportBankDetails(invoiceIds: String[]): CsvFile`
7. Click `Run workflow`.
8. Watch the agent workflow:
   - searches overdue invoices above EUR 5,000
   - opens invoice details
   - prepares a payment packet
   - reaches guarded bank details export
9. When Guard asks for approval, click `Deny`.
10. Confirm the workflow continues and generates a payment packet with bank details redacted.
11. Confirm audit shows business events such as:
   - invoices scanned
   - invoice details opened
   - bank export denied
   - payment packet generated with redactions

This is the primary hackathon demo. It shows Graft Guard as a governed agent workflow layer, not just a form replay script.

## Demo Prompt Matrix

The ERP seed data includes overdue, pending, and paid invoices across `none`, `review`, and `blocked` risk states. Use these prompts to show tool reuse and guarded workflow behavior:

- `Prepare a vendor payment packet for all overdue invoices above EUR 5,000, but do not export bank details without approval.`
  Shows the main workflow, Guard denial, and redacted packet generation.
- `Prepare a vendor payment packet for all pending invoices above EUR 10,000, but do not export bank details without approval.`
  Reuses the saved invoice/payment tools with different run inputs.
- `Prepare a vendor payment packet for all overdue invoices above EUR 20,000, including flagged vendors, but do not export bank details without approval.`
  Shows a smaller high-risk packet with blocked/review vendors.
- `Find paid invoices above EUR 7,000 and prepare an audit summary without exporting bank details.`
  Demonstrates a read-only workflow that can reuse search/open/extract capabilities.
- `Find customers with unpaid invoices over EUR 10,000, check their latest orders, and prepare a credit-hold recommendation without applying the hold.`
  Demonstrates a delta compile: saved invoice tools should remain in the tool library while the agent adds only missing customer/credit-hold capabilities.

On recompile, the extension sends the saved tool library to the agent compiler. The compiler is expected to reuse equivalent saved tools, return only missing capabilities, and explain unavoidable updates in risk notes.

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

The frontend expects a proxy when MiniMax is enabled. For local demos, create `.env.local`.
Only the API key is required for the proxy; the MiniMax endpoint and model have defaults:

```bash
VITE_AGENT_PROVIDER=minimax
VITE_MINIMAX_PROXY_URL=http://localhost:8787
VITE_MINIMAX_MODEL=MiniMax-M2.7

MINIMAX_API_KEY=your-key
```

Optional overrides:

```bash
MINIMAX_API_URL=https://api.minimax.io/v1/chat/completions
MINIMAX_MODEL=MiniMax-M2.7
MINIMAX_TIMEOUT_MS=20000
VITE_AGENT_COMPILE_TIMEOUT_MS=20000
VITE_AGENT_TASK_PLAN_TIMEOUT_MS=12000
```

Then start the proxy and frontend in two terminals:

```bash
npm run dev:agent-proxy
```

```bash
npm run dev
```

The proxy loads `.env.local` automatically. The frontend only exposes `VITE_*` values to the browser; `MINIMAX_API_KEY` stays server-side in the local proxy process.

Expected proxy endpoints:

- `POST /compile-tool-group`
- `POST /plan-workflow`
- `POST /compile`
- `POST /parse-command`

The proxy owns API keys, model selection, rate limits, retries, and provider logs. The extension keeps schema validation, approval, replay, Guard decisions, redaction, and audit local.

If the proxy is not configured or the model returns invalid JSON, Graft Guard falls back to the deterministic local compiler and labels the workflow as `local fallback`.

## Real-Site Compile Smoke Tests

Use this branch to test non-demo sites in increasing difficulty:

1. [Selenium Web Form](https://www.selenium.dev/selenium/web/web-form.html)
   - Prompt: `Create a reusable tool to fill this form and submit it.`
   - Expected: compiles one write tool with semantic locators for text, textarea, select/range/date controls.
2. [QA Playground](https://www.qaplayground.com/)
   - Prompt: `Create reusable tools to search a table and extract matching rows.`
   - Expected: collector observes ARIA roles, table/grid regions, and buttons without hanging.
3. [The Dummy Site](https://thedummysite.com/)
   - Prompt: `Create a reusable tool to update a profile form without changing the password.`
   - Expected: password fields are skipped; normal profile fields are summarized.
4. [Automation Exercise](https://automationexercise.com/)
   - Prompt: `Create a reusable tool to search for a product and add it to cart with approval.`
   - Expected: storefront navigation/actions compile; write/cart action is guarded.

Run Shopify/Ozcart admin only after these pass. Admin SPAs add auth state, dynamic Polaris widgets, and virtualized lists, so failures are harder to diagnose until the collector and semantic locator baseline is green.

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
