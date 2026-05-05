# PRD: Graft Guard

## Copy-Paste Prompt For Multi-Agent CLI

You are a multi-agent engineering team working on a GOSIM 2026 hackathon MVP.

Build **Graft Guard**:

> Compile legacy web apps into typed, cached, auditable agent tools, with approval guardrails and deterministic local replay.

The project must be demo-ready, not production-complete. Prioritize a stable 60-second live demo over generality.

---

## Context

GOSIM 2026 emphasizes open-source AI, agentic apps, human-agent interaction, productivity, and technical depth. We want to avoid generic chatbots, RAG wrappers, simple browser agents, and shallow LLM demos.

Current browser agents often operate legacy web apps by visually inspecting pages and clicking around every time. This is slow, expensive, brittle, and unsafe. Many internal enterprise tools have no API, but their UI workflows are stable enough to be captured once and replayed.

Graft Guard lets an agent:

1. Learn a legacy web workflow once.
2. Compile it into a typed tool.
3. Cache the tool locally.
4. Replay it deterministically without another LLM call.
5. Ask for approval before risky actions.
6. Produce an audit trail for every run.

Core pitch:

> They automate the browser. We compile the app.

Alternate technical pitch:

> Browser agents are JIT: they reason at every click. Graft Guard learns once, then replays a guarded typed tool locally.

---

## Product Goal

Build a local MVP that demonstrates:

1. A fake legacy ERP web app.
2. A "Learn this app" action.
3. A typed tool schema such as:

```ts
tool queryOrders(startDate: Date, endDate: Date, minAmount: Number): Order[]
```

4. A cached replay engine that fills the ERP form and extracts table results without calling the LLM.
5. A guard approval card before risky actions.
6. An audit log showing:
   - learned once
   - cached locally
   - replayed locally
   - 0 LLM calls during replay

---

## Non-Goals

Do not build a general browser-use agent.

Do not support arbitrary websites.

Do not depend on perfect DOM-to-schema inference.

Do not build a full Chrome Web Store extension unless it is trivially available.

Do not implement real enterprise authentication.

Do not build full RBAC, sandboxing, or policy management.

Do not make the demo depend on live LLM schema generation. A hardcoded schema behind a compiler interface is acceptable.

---

## Demo Story

Open a deliberately ugly legacy web app:

**Acme ERP Order Management v3.2**

The user clicks:

> Learn this app

Graft Guard displays the compiled typed tool:

```ts
queryOrders(startDate: Date, endDate: Date, minAmount: Number): Order[]
```

Then the user enters:

> Find all orders from last month over 1000 euros.

First run:

1. Graft Guard maps the request to `queryOrders`.
2. Guard approval appears because this reads business data.
3. User clicks "Allow once".
4. Replay engine fills date/min amount fields and clicks Search.
5. Results are extracted from the table.
6. Audit log records all steps.

Second run:

1. Same tool runs from cached schema.
2. No LLM call is made.
3. Audit log shows:

```txt
Replay mode: local cached schema
LLM calls: 0
```

Stretch demo:

Add `exportCsv()` as a higher-risk action requiring stronger approval.

---

## Recommended Tech Stack

Use the simplest stack that can ship quickly:

- Vite
- React
- TypeScript
- LocalStorage or IndexedDB for schema cache
- In-page DOM replay for MVP
- Optional mocked LLM interface

Suggested layout:

```txt
src/
  App.tsx
  demo-erp/
    DemoErp.tsx
    mockOrders.ts
  graft/
    schemaTypes.ts
    schemaCompiler.ts
    replayEngine.ts
    guardEngine.ts
    auditLog.ts
  ui/
    GraftPanel.tsx
    SchemaViewer.tsx
    ApprovalCard.tsx
    AuditTimeline.tsx
```

---

## Core Modules

### 1. Demo ERP

Build a fake legacy ERP UI.

Required features:

- Header: `Acme ERP Order Management v3.2`
- Search form:
  - start date
  - end date
  - min amount
  - customer name optional
- Search button
- Results table
- Export CSV button
- Old enterprise styling
- Stable DOM IDs

Required DOM IDs:

```html
#start-date
#end-date
#min-amount
#customer-name
#search-orders
#export-csv
#orders-table
```

Mock order fields:

```ts
type Order = {
  id: string;
  date: string;
  customer: string;
  amount: number;
  status: "paid" | "pending" | "flagged";
};
```

Acceptance:

- Manual search works.
- Results update correctly.
- Table extraction is possible.

---

### 2. Schema Compiler

Build a compiler interface.

MVP can return hardcoded schema, but must look like a real compiler boundary.

Function:

```ts
compileApp(domSummary: DomSummary): Promise<ToolSchema[]>
```

MVP behavior:

- On "Learn this app", return `queryOrders` and optional `exportCsv`.
- Store schemas in local cache.
- Record audit event: `learned_tool`.

Important:

The project's core is not magic DOM inference. The core is typed tools, cached replay, guard approval, and auditability.

---

### 3. Tool Schema Format

Use an MCP-compatible shape, but keep it simple.

Example:

```json
{
  "name": "queryOrders",
  "description": "Search Acme ERP orders by date range and minimum amount",
  "risk": "read",
  "inputSchema": {
    "type": "object",
    "properties": {
      "startDate": { "type": "string", "format": "date" },
      "endDate": { "type": "string", "format": "date" },
      "minAmount": { "type": "number" }
    },
    "required": ["startDate", "endDate", "minAmount"]
  },
  "replayPlan": [
    { "type": "setValue", "selector": "#start-date", "valueFrom": "startDate" },
    { "type": "setValue", "selector": "#end-date", "valueFrom": "endDate" },
    { "type": "setValue", "selector": "#min-amount", "valueFrom": "minAmount" },
    { "type": "click", "selector": "#search-orders" },
    { "type": "extractTable", "selector": "#orders-table" }
  ]
}
```

TypeScript types:

```ts
export type RiskLevel = "read" | "write" | "export" | "destructive";

export type ReplayStep =
  | { type: "setValue"; selector: string; valueFrom: string }
  | { type: "click"; selector: string }
  | { type: "extractTable"; selector: string };

export type ToolSchema = {
  name: string;
  description: string;
  risk: RiskLevel;
  inputSchema: unknown;
  replayPlan: ReplayStep[];
};
```

---

### 4. Replay Engine

Build deterministic replay.

Function:

```ts
replayTool(schema: ToolSchema, params: Record<string, unknown>): Promise<ReplayResult>
```

Required behavior:

- Validate required params.
- Execute each replay step.
- Fill form fields.
- Click search.
- Wait briefly for table update.
- Extract rows.
- Return structured result.
- Record trace for every step.

Important:

Replay must not call the LLM.

Acceptance:

Calling:

```ts
replayTool(queryOrdersSchema, {
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  minAmount: 1000
});
```

must fill the ERP form, click Search, and return matching rows.

---

### 5. Guard Engine

Build lightweight approval.

Risk rules:

- `read`: approval required in demo, to make guard visible
- `write`: approval required
- `export`: approval required, stronger warning
- `destructive`: block or require explicit approval

Approval actions:

- Allow once
- Deny

Approval card copy:

```txt
Graft Guard wants to run:
queryOrders(startDate, endDate, minAmount)

Risk: read business data
This will search Acme ERP and extract matching order rows.

[Allow once] [Deny]
```

For `exportCsv`:

```txt
Risk: export business data
This may download customer/order data from Acme ERP.
```

Acceptance:

- Tool execution pauses before approval.
- Deny stops execution.
- Allow once continues replay.
- Decision appears in audit log.

---

### 6. Audit Log

Build an audit timeline.

Audit event shape:

```ts
type AuditEvent = {
  id: string;
  timestamp: string;
  type:
    | "learned_tool"
    | "approval_requested"
    | "approval_allowed"
    | "approval_denied"
    | "replay_started"
    | "replay_step"
    | "replay_completed"
    | "replay_failed";
  toolName?: string;
  params?: Record<string, unknown>;
  risk?: RiskLevel;
  message: string;
  llmCalls: number;
};
```

Required visible messages:

```txt
Learned queryOrders from Acme ERP
Cached schema locally
Approval requested for queryOrders
Approval allowed once
Replay started from cached schema
Set #start-date from startDate
Set #end-date from endDate
Set #min-amount from minAmount
Clicked #search-orders
Extracted 3 rows from #orders-table
Replay completed
LLM calls during replay: 0
```

Acceptance:

- Audit log is visible in the right panel.
- Second run clearly says cached replay and `0 LLM calls`.

---

### 7. Graft Guard Panel

Build a right-side panel next to the ERP.

Sections:

1. Learn button
2. Learned tools list
3. Schema viewer
4. Natural language command input
5. Approval card
6. Replay trace
7. Audit timeline

Natural language command parser:

MVP can be simple and deterministic.

Input:

```txt
Find all orders from last month over 1000 euros
```

Output params:

```ts
{
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  minAmount: 1000
}
```

Do not spend time building robust natural language parsing. Use a simple parser or a preset button.

---

## Multi-Agent Work Split

### Agent 1: Demo ERP Owner

Owns:

- Fake ERP page
- Mock data
- Search/filter behavior
- Stable DOM IDs
- Ugly legacy styling

Deliverables:

- `DemoErp.tsx`
- `mockOrders.ts`

Acceptance:

- Manual search works.
- DOM IDs match the schema.
- Results table updates.

---

### Agent 2: Schema + Replay Owner

Owns:

- `schemaTypes.ts`
- `schemaCompiler.ts`
- `replayEngine.ts`
- hardcoded schema
- replay trace
- table extraction

Deliverables:

- Tool schema types
- `compileApp`
- `replayTool`

Acceptance:

- `compileApp` returns `queryOrders`.
- `replayTool` fills the ERP and extracts rows.
- Replay has no LLM calls.

---

### Agent 3: Guard + Audit Owner

Owns:

- `guardEngine.ts`
- `auditLog.ts`
- approval state
- audit events

Deliverables:

- risk labels
- approval card state helpers
- audit store

Acceptance:

- Approval required before tool run.
- Deny stops execution.
- Allow once continues.
- Audit log records all events.

---

### Agent 4: Panel + Integration Owner

Owns:

- `GraftPanel.tsx`
- `SchemaViewer.tsx`
- `ApprovalCard.tsx`
- `AuditTimeline.tsx`
- full demo flow

Deliverables:

- Right-side UI
- Integration with ERP, compiler, guard, replay, audit

Acceptance:

- End-to-end demo works.
- UI clearly communicates:
  - compiled once
  - cached locally
  - replayed deterministically
  - guarded with approval
  - audited

---

## MVP Acceptance Criteria

The MVP is complete when:

1. The app runs locally.
2. Fake ERP is visible.
3. Clicking "Learn this app" displays typed `queryOrders` schema.
4. A command can run `queryOrders`.
5. Guard approval appears before execution.
6. Replay fills the ERP form and extracts table rows.
7. Running again uses cached schema.
8. Audit log clearly shows `LLM calls during replay: 0`.
9. Demo can be completed in 60 seconds.

---

## Demo Script

0-10s:

Show ugly Acme ERP.

Say:

> Most enterprise apps do not have APIs. Browser agents click around every time.

10-20s:

Click "Learn this app".

Show typed tool:

```ts
queryOrders(startDate: Date, endDate: Date, minAmount: Number): Order[]
```

Say:

> Graft Guard compiles the UI into a typed tool.

20-35s:

Run:

> Find all orders from last month over 1000 euros.

Approval appears. Click Allow once.

35-45s:

Replay fills form, clicks Search, extracts rows.

45-55s:

Run again from cache.

Show:

```txt
Replay mode: cached schema
LLM calls: 0
```

55-60s:

Say:

> They automate the browser. We compile the app.

---

## Fallback Plan

If DOM-to-schema inference is unstable:

- Use hardcoded schema.
- Say: "For the hackathon demo, compiler output is deterministic. The architecture supports LLM-assisted schema generation."

If natural language parser is unstable:

- Use a preset command button.

If approval state gets buggy:

- Make approval synchronous and simple.

If second run cache is buggy:

- Use LocalStorage with a fixed key:

```txt
graftguard.schemas.acme-erp
```

---

## README Claims To Avoid

Do not claim:

- fully secure
- works on any website
- replaces APIs
- production-ready compliance
- perfect sandboxing
- automatic schema inference for arbitrary apps

Safe claims:

- demo of compile-on-first-use agent tools
- typed schema
- cached replay
- local deterministic execution
- approval guardrails
- audit trail
- MCP-compatible schema direction

---

## Final North Star

The demo must make this obvious:

> A browser agent thinks every time. Graft Guard learns once, then runs a typed, guarded, auditable tool.

