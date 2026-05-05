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

## Flexible Compiler Plan

The compiler should not force the agent to emit final executable schemas. That makes the agent brittle and turns model variance into user-visible fallback. The long-term architecture is:

```txt
AgentDraft
  free semantic interpretation of page, capabilities, risks, and workflow
    ↓
Tool IR
  normalized reusable tools with stable names, risk levels, selectors, and arguments
    ↓
Executable Plan
  click / setValue / extractTable / requestApproval primitives that the extension can run
```

### Plan

1. Accept tolerant model output.
   - Allow reasoning wrappers, markdown fences, and provider-specific JSON shapes.
   - Extract the structured payload instead of rejecting the whole response.

2. Ask the model for an `AgentDraft`, not final `ToolSchema`.
   - The draft can describe capabilities, workflow steps, risks, and proposed tools in natural names.
   - The model is allowed to say "search overdue invoices" or "export bank details"; the compiler maps that to internal tools.

3. Normalize through a local compiler boundary.
   - Convert agent capabilities into reusable tools.
   - Convert workflow intent into a workflow plan that references those reusable tools.
   - Convert sensitivity/destructive cues into Guard policy.

4. Keep vendor payment as a first-class adapter.
   - If the page matches Acme ERP invoices, normalize any agent draft into the four canonical reusable tools:
     `searchInvoices`, `openInvoice`, `extractPaymentPacket`, `exportBankDetails`.
   - This preserves the strong demo while still proving the agent generated the semantic draft.

5. Add a generic app adapter.
   - For unknown pages, infer a reusable tool from visible inputs, buttons, and tables.
   - Use agent draft semantics for naming, description, workflow, and risk.
   - Fall back to deterministic DOM heuristics only when the agent/proxy is unavailable.

6. Keep tools separate from workflows.
   - Generated tools are reusable per site/app.
   - Compiled workflow is per prompt and can reuse existing tools.
   - Workflow run is per execution and contains logs, Guard decisions, and outputs.

7. Improve failure visibility.
   - Fallback should include a reason in `riskNotes`.
   - The UI can stay calm, but diagnostics should tell us whether failure came from network, parse, validation, or model semantics.

### Implementation Slice

The first implementation slice will:

- change the MiniMax proxy prompt from strict final schema generation to flexible `AgentDraft` generation;
- keep tolerant parsing for `<think>` and markdown-wrapped JSON;
- normalize vendor payment drafts into canonical reusable tools;
- add a generic DOM-based adapter for other websites;
- let the extension call the agent compiler for any inspected website, not only Acme ERP invoices.

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
