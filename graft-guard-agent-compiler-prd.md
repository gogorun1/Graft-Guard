# PRD: Graft Guard Agent Compiler Integration

## Purpose

Graft Guard should not look like a hardcoded RPA demo. The core technical claim is:

> An agent/API compiles a legacy web app into typed tools and a workflow plan; Graft Guard validates, guards, and executes those tools locally.

This PRD adds an Agent Compiler layer for the Vendor Payment Packet workflow.

## Product Goal

The demo should show three layers working together:

1. Agent compiler creates a typed tool group from a page + prompt.
2. Local Graft Guard runtime validates and executes tools.
3. Guard controls risky sub-actions, especially bank/account data export.

## Target Architecture

```txt
Extension side panel
  prompt + page DOM summary
    ↓
Agent compiler
  MiniMax/proxy if configured
  local deterministic fallback otherwise
    ↓
Compiled tool group
  typed tools
  workflow plan
  risk notes
    ↓
Graft Guard runtime
  local replay / app adapter
  Guard approval
  redaction continuation
  audit
```

## User Story

The user opens the standalone Acme ERP page, which should look like a plain legacy ERP app with no built-in Graft Guard sidebar.

Then the user opens the Graft Guard extension and sees a default prompt:

```txt
Prepare a vendor payment packet for all overdue invoices above EUR 5,000, but do not export bank details without approval.
```

The user clicks:

```txt
Confirm and compile
```

Graft Guard sends the prompt and page summary to the Agent Compiler.

If API is configured:

```txt
Compiled by Agent API
```

If API is unavailable:

```txt
Compiled by local fallback
```

The compiled output is a tool group:

```ts
searchInvoices(status: "overdue", minAmount: Number): Invoice[]
openInvoice(invoiceId: String): InvoiceDetail
extractPaymentPacket(invoiceIds: String[]): PaymentPacket
exportBankDetails(invoiceIds: String[]): CsvFile // guarded
```

The user runs the workflow. Guard blocks bank details export. If denied, the workflow continues and generates a redacted payment packet.

## Functional Requirements

### FR1: Standalone ERP Is Only The Target App

Standalone mode should render only the Acme ERP app.

It must not show:

- Graft Guard sidebar
- compile button
- schema viewer
- audit timeline

The extension is the product UI.

### FR2: Default Prompt In Textarea

The prompt textarea should be prefilled with:

```txt
Prepare a vendor payment packet for all overdue invoices above EUR 5,000, but do not export bank details without approval.
```

Leaving the prompt unchanged should be the primary path.

### FR3: Agent Compiler API

Add:

```ts
compileToolGroupWithAgent(input): Promise<CompiledToolGroup>
```

Input:

```ts
type AgentCompilerInput = {
  prompt: string;
  pageSummary: PageDomSummary;
};
```

Output:

```ts
type CompiledToolGroup = {
  name: string;
  description: string;
  tools: ToolSchema[];
  workflowPlan: WorkflowPlanStep[];
  riskNotes: string[];
  provider: "agent-api" | "local-fallback";
};
```

### FR4: Proxy Endpoint

When configured, call:

```txt
POST /compile-tool-group
```

Body:

```json
{
  "prompt": "...",
  "pageSummary": { "...": "..." },
  "model": "..."
}
```

Expected response:

```json
{
  "name": "Vendor payment workflow",
  "description": "Prepare payment packets from overdue vendor invoices.",
  "tools": [],
  "workflowPlan": [],
  "riskNotes": []
}
```

No API keys should be placed in browser code.

### FR5: Local Fallback

If:

- provider is local
- proxy URL is absent
- proxy request fails
- response validation fails

then compile the deterministic Vendor Payment workflow locally.

The UI should make provider status visible but not scary:

```txt
Compiled by local fallback
```

### FR6: Validation

Before accepting agent output:

- tool group has a name
- tools array is non-empty
- each tool has name, risk, input schema, replay plan
- `exportBankDetails` is marked guarded/export risk
- workflow plan references known tools only

Invalid output falls back to local deterministic compiler.

### FR7: Extension Demo Mode

When the active page looks like Acme ERP invoices, extension should run the Vendor Payment workflow path.

Detection can use:

- `#nav-invoices`
- `#invoice-min-amount`
- `#search-invoices`
- `#invoices-table`
- `#export-bank-details`

If not detected, keep generic website compiler behavior.

### FR8: Agent Run

The agent runner should use the compiled workflow plan.

First implementation may run deterministic steps, but must be shaped as tool calls:

```txt
tool_call searchInvoices
tool_result 4 invoices scanned
tool_call openInvoice
tool_result 4 details opened
guard_required exportBankDetails
packet_generated redacted
```

### FR9: Guard Continuation

Guard denial must not cancel the workflow.

If user denies `exportBankDetails`:

- add audit `bank export denied`
- generate packet with redactions
- show final packet

If user allows:

- add audit `bank export approved`
- generate packet with bank details included

## UI Requirements

Extension UI:

```txt
Workflow compiler
Graft Guard

[prompt textarea with default prompt]
[Confirm and compile]

Compiled workflow
Vendor payment workflow
Compiled by Agent API / local fallback
4 typed tools

[Run workflow]

Agent workflow
...

Guard approval
...

Payment packet
...

Diagnostics
```

Do not show raw JSON by default.

## Implementation Phases

### Phase 1

- Standalone renders only ERP.
- Extension becomes primary Graft Guard UI.
- Default prompt is prefilled.

### Phase 2

- Add `CompiledToolGroup` types.
- Add `agentCompiler`.
- Add API path and local fallback.
- Validate output.

### Phase 3

- Extension compile calls `agentCompiler`.
- UI shows provider and tool group.

### Phase 4

- Extension run executes Vendor Payment workflow.
- Guard denial continues with redaction.

### Phase 5

- Add proxy/dev instructions to README.
- Keep MiniMax API key outside browser.

## Acceptance Criteria

1. Standalone page has no right Graft Guard sidebar.
2. Extension textarea shows the default payment prompt.
3. Compile can call `/compile-tool-group` when configured.
4. Compile falls back locally when API is not configured.
5. UI clearly shows Agent API vs local fallback.
6. Compiled output displays a 4-tool group.
7. Running workflow triggers Guard for bank details.
8. Deny generates a redacted payment packet.
9. Build passes.
