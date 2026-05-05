# PRD: Graft Guard Vendor Payment Packet Demo

## Purpose

This PRD pivots the main Graft Guard demo from a single-form automation into a governed agent workflow.

The demo should make one product idea obvious:

> Graft Guard turns legacy web apps into typed tool groups that an agent can use, while Guard blocks or redacts high-risk sub-actions without stopping the whole workflow.

## Demo Task

Primary user request:

```txt
Prepare a vendor payment packet for all overdue invoices above EUR 5,000, but do not export bank details without approval.
```

This is stronger than a simple order search because it shows:

- multi-step business work
- multiple typed tools compiled from one app
- cross-section navigation
- guarded access to sensitive data
- graceful continuation after a denial
- business-facing output instead of replay logs

## Target Demo Story

User opens the Acme ERP demo app and runs Graft Guard.

1. User clicks compile.
2. Graft Guard compiles the app into a tool group:

```ts
searchInvoices(status: "overdue", minAmount: Number): Invoice[]
openInvoice(invoiceId: String): InvoiceDetail
extractPaymentPacket(invoiceIds: String[]): PaymentPacket
exportBankDetails(invoiceIds: String[]): CsvFile // guarded
```

3. User enters:

```txt
Prepare payment packet for overdue invoices above 5000 euros.
```

4. Agent plans and runs:

- click `Invoices`
- filter `status = overdue`
- filter `amount > 5000`
- search invoices
- open each invoice detail
- extract vendor name, invoice id, amount, due date, and risk flag
- attempt bank detail export if needed

5. Guard interrupts:

```txt
This will expose vendor bank/account data.
Risk: exposes bank/account data.
Allow once?
```

6. Demo operator clicks `Deny`.
7. Agent continues and generates a payment packet with bank details redacted.
8. Audit shows business-level events:

```txt
4 invoices scanned
4 invoice details opened
bank export denied
payment packet generated with redactions
```

## Product Positioning

The old demo answers:

> Can Graft Guard automate this web form?

The new demo answers:

> Can an agent safely use legacy web apps as governed typed tools?

This is the better story for Graft Guard.

## Primary User Flow

### 1. Compile App

The panel starts with a compact compiler UI.

Visible:

- `Workflow compiler`
- `Graft Guard`
- prompt box
- `Confirm and compile`

Prompt may be blank. If blank, use the default demo compile target:

```txt
Create a vendor payment workflow from this ERP app.
```

Compile result should be a tool group, not one small tool.

### 2. Review Tool Group

Show a compact tool group card:

```txt
Vendor payment workflow
4 tools
read + guarded export
```

Expanded detail:

```ts
searchInvoices(status: "overdue", minAmount: Number): Invoice[]
openInvoice(invoiceId: String): InvoiceDetail
extractPaymentPacket(invoiceIds: String[]): PaymentPacket
exportBankDetails(invoiceIds: String[]): CsvFile // guarded
```

Default view should not show raw JSON.

### 3. Run Agent Request

User enters:

```txt
Prepare payment packet for overdue invoices above 5000 euros.
```

Button:

```txt
Run workflow
```

The agent run should stream simple business steps:

```txt
Searching overdue invoices above EUR 5,000
Found 4 invoices
Opening invoice details
Preparing payment packet
Bank details require approval
```

Avoid verbose "thought" logs. Show tool calls only when useful.

### 4. Guarded Sub-Action

When the workflow reaches `exportBankDetails`, show a Guard approval card.

Required copy:

```txt
Bank details require approval
This will expose vendor bank/account data for 4 invoices.
```

Actions:

- `Allow once`
- `Deny`

If allowed:

- include bank details in packet
- audit `bank export approved`

If denied:

- continue workflow
- redact bank details
- audit `bank export denied`
- final packet displays `Bank details: redacted`

The denial must not cancel the whole workflow.

### 5. Payment Packet Output

Final output should be business-facing.

Payment packet includes:

- table summary
- total payment amount
- flagged vendors
- needs approval list
- bank detail status

Example:

```txt
Payment packet

Invoices: 4
Total: EUR 42,800
Flagged vendors: 1
Bank details: redacted
Needs approval: 2 invoices
```

## Demo App Requirements

The Acme ERP demo app should include at minimum:

- `Invoices` section/tab
- invoice search form
- status filter with `overdue`
- minimum amount input
- invoice result table
- invoice detail view
- bank details section
- risk flag per invoice/vendor

Suggested invoice fields:

```ts
type Invoice = {
  invoiceId: string;
  vendorName: string;
  amount: number;
  dueDate: string;
  status: "overdue" | "pending" | "paid";
  riskFlag: "none" | "review" | "blocked";
};

type InvoiceDetail = Invoice & {
  description: string;
  paymentTerms: string;
  bankAccountLast4: string;
  bankCountry: string;
};
```

## Typed Tool Group

### `searchInvoices`

```ts
searchInvoices(status: "overdue", minAmount: Number): Invoice[]
```

Behavior:

- navigates to Invoices
- sets status filter
- sets minimum amount
- clicks Search
- extracts invoice rows

Risk:

```txt
read
```

### `openInvoice`

```ts
openInvoice(invoiceId: String): InvoiceDetail
```

Behavior:

- opens invoice detail row
- extracts vendor name, invoice id, amount, due date, and risk flag
- does not expose full bank details

Risk:

```txt
read
```

### `extractPaymentPacket`

```ts
extractPaymentPacket(invoiceIds: String[]): PaymentPacket
```

Behavior:

- aggregates invoice details
- computes total amount
- identifies flagged vendors
- identifies invoices needing approval
- produces packet summary

Risk:

```txt
read
```

### `exportBankDetails`

```ts
exportBankDetails(invoiceIds: String[]): CsvFile
```

Behavior:

- exposes vendor bank/account data
- only runs after Guard approval

Risk:

```txt
export_sensitive
```

Guard copy:

```txt
This will expose vendor bank/account data.
```

## Agent Orchestration

First implementation should use a deterministic local orchestrator.

Recommended module:

```txt
src/graft/vendorPaymentAgent.ts
```

Suggested API:

```ts
runVendorPaymentAgent(request: string, guardDecision?: ApprovalDecision): AgentRun
```

Suggested event stream:

```ts
type AgentRunEvent =
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; summary: string }
  | { type: "guard_required"; tool: string; risk: string; invoiceIds: string[] }
  | { type: "guard_denied"; tool: string }
  | { type: "packet_generated"; packet: PaymentPacket };
```

The LLM/MiniMax boundary should sit at the planner layer later:

```txt
user request
  -> planner, local first and MiniMax later
  -> typed tool calls
  -> guard policy
  -> deterministic app adapter/replay
  -> payment packet
```

Do not let the model directly operate DOM.

## Guard Requirements

Guard must intercept risky sub-actions, not only whole workflows.

Required behavior:

- `searchInvoices` runs without approval or with low-risk read notice.
- `openInvoice` runs without sensitive bank fields.
- `extractPaymentPacket` runs without approval.
- `exportBankDetails` requires explicit approval.
- Deny results in redaction and continued packet generation.
- Audit records the decision.

## UI Requirements

Default UI should focus on the workflow, not schemas.

Visible sections:

1. Compiler prompt
2. Compiled tool group
3. Agent request
4. Guard approval when needed
5. Payment packet result
6. Compact audit summary

Hidden or folded:

- Diagnostics
- raw schema
- raw replay trace
- DOM summary

`Customized tool` should remain fallback-only:

- hidden by default
- appears after warning/error
- appears while recording

`Diagnostics` should remain bottom folded:

- page fingerprint
- inputs/buttons/tables
- captured steps
- tool schema JSON if needed

## Audit Requirements

Audit should be business-facing by default.

Required default audit:

```txt
4 invoices scanned
4 details opened
bank export denied
packet generated with redactions
```

Developer details can include:

- tool calls
- replay steps
- selector details
- LLM call count

## Acceptance Criteria

The 60-second demo passes if:

1. Compile produces a visible group of 4 typed tools.
2. User can run:

```txt
Prepare payment packet for overdue invoices above 5000 euros.
```

3. Demo app navigates to Invoices.
4. Search filters overdue invoices above EUR 5,000.
5. Workflow opens at least 3 invoice details.
6. Guard appears before bank details export.
7. Denying Guard does not cancel the workflow.
8. Final payment packet is generated with bank details redacted.
9. Audit shows business events.
10. No raw schema/debug panel is visible by default.

## Non-Goals For This Demo

- Do not implement arbitrary website multi-tool inference yet.
- Do not implement real payments.
- Do not export actual bank data.
- Do not connect to live ERP systems.
- Do not require MiniMax for the demo path.
- Do not show chain-of-thought style reasoning.

## Implementation Plan

### Phase 1: Demo App Upgrade

- Add Invoices tab/section.
- Add invoice search filters.
- Add invoice result table.
- Add invoice detail view.
- Add mock vendor bank data.
- Add risk flags.

### Phase 2: Tool Group Schema

- Add `ToolGroupSchema` or equivalent.
- Compile Acme ERP into the four vendor payment tools.
- Show tool group card in UI.

### Phase 3: Agent Orchestrator

- Add deterministic `vendorPaymentAgent`.
- Parse request for overdue + min amount.
- Emit tool call events.
- Generate `guard_required` for bank export.

### Phase 4: Guard Continuation

- Add approval card for bank details.
- Deny should continue with redactions.
- Allow should include bank details in packet.

### Phase 5: Business Output + Audit

- Render payment packet.
- Render business audit summary.
- Fold diagnostics.

## Open Questions

1. Should the default demo always deny bank export, or should operator choice drive the packet state?
2. Should `openInvoice` expose bank account last 4 digits, or should all bank fields be blocked until `exportBankDetails`?
3. Should the compiled tool group be cached under current origin, or treated as a demo app capability?
4. Should MiniMax be shown as "planner available later" or completely hidden in this demo?
5. Should the old single-tool extension flow remain behind Diagnostics, or be replaced for the demo branch?
