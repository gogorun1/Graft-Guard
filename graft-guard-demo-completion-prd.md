# PRD: Graft Guard Demo Completion

## Purpose

This PRD updates the browser extension direction after validating the first real-page demos. The product now needs to move from an engineering control panel to a clean agent-tool compiler demo.

The demo should make one idea obvious:

> Learn a website once with AI assistance, then run a typed, guarded, cached tool locally with zero LLM calls during replay.

## Current State

Implemented:

- Chrome MV3 extension shell.
- Side panel UI.
- Active page DOM inspection.
- Workflow capture from real webpages.
- Capture persistence across form submit/navigation.
- Captured workflow to candidate schema generation.
- Per-page local schema cache.
- Guard approval before tool execution.
- Active-page replay for saved tools.
- Audit timeline showing local replay events.
- MiniMax provider hook exists, but the default path is still local/deterministic.

Validated examples:

- GitHub collaborator flow capture:
  - menu clicks
  - settings navigation
  - modal open
  - people search field
  - candidate schema such as `addPeople(personName: String): ActionResult`
- Selenium web form capture:
  - text
  - textarea
  - checkbox
  - datalist
  - select
  - submit
  - candidate schema such as `submitForm(...): ActionResult`

Known rough edges:

- Too many visible workflow buttons.
- Inspect and capture are exposed as first-class product steps.
- AI is not yet a visible part of the main compile flow.
- Selector stability is still weak on modern apps with dynamic IDs.
- Replay waits/navigation handling are basic.
- Parameter names and field types are improving but not final.

## Product Reset

The main user flow should be:

```txt
Learn website
→ Review suggested tool
→ Save tool
→ Run tool
```

Internal implementation can still use:

- DOM inspection
- prompt-to-schema
- captured demonstration
- local compiler fallback
- MiniMax compiler hook
- schema validation
- replay
- guard approval
- audit

But the user should not experience those as separate mandatory steps.

## New Demo Story

1. User opens a website, such as the Selenium web form.
2. User opens Graft Guard side panel.
3. User types:

```txt
Create a tool to submit this form
```

4. User clicks:

```txt
Learn website
```

5. Graft Guard internally:

- inspects the page DOM
- sends DOM summary + user intent to the compile layer
- uses MiniMax if configured
- otherwise uses local deterministic compiler fallback
- returns a candidate typed tool

6. User reviews:

```ts
submitForm(
  textInput: String,
  textarea: String,
  defaultCheckbox: Boolean,
  dropdownDatalist: String,
  dropdownSelect: String
): ActionResult
```

7. User clicks:

```txt
Save tool
```

8. User fills tool inputs and clicks:

```txt
Run saved tool
```

9. Approval appears because submitting a form is a write action.
10. User clicks `Allow once`.
11. Replay runs locally through the content script.
12. Audit shows:

```txt
Replay started from cached schema
Set ...
Clicked ...
Replay completed
LLM calls during replay: 0
```

## Main UI Requirements

### Primary Learn Section

Visible by default:

- `Learn website` heading
- intent textarea:

```txt
Describe what you want to automate
```

- primary button:

```txt
Learn website
```

- fallback button:

```txt
Show me once
```

- optional advanced toggle:

```txt
Advanced
```

### Suggested Tool Card

Visible after learning:

- tool signature
- risk label
- warnings, if any
- `Save tool`

Example:

```txt
Suggested tool
Risk: write

submitForm(textInput: String, defaultCheckbox: Boolean): ActionResult

[Save tool]
```

### Saved Tools Section

Visible after saving:

- saved tool list
- schema viewer
- generated tool input form
- `Run saved tool`

### Approval Card

Visible before replay:

```txt
Graft Guard wants to run:
submitForm(...)

Risk: write business data
This will operate the current website using a cached schema.

[Allow once] [Deny]
```

### Advanced Section

Hidden by default. Shows:

- active page summary
- forms/inputs/buttons/tables
- captured workflow steps
- selector warnings
- raw schema
- audit timeline

## Compile Strategy

There is one user-facing action:

```txt
Learn website
```

Internally it can choose among:

### Path A: Prompt-to-Schema

Input:

- user intent
- page DOM summary

Output:

- candidate `ToolSchema`
- risk
- warnings

Provider priority:

1. MiniMax provider, if configured.
2. Local heuristic compiler fallback.

### Path B: Demonstration-to-Schema

Used when:

- prompt-to-schema is weak
- website is menu-heavy
- user clicks `Show me once`

Input:

- captured steps
- page DOM summary
- optional user intent

Output:

- candidate `ToolSchema`
- risk
- warnings

## AI Boundary

AI belongs only in compile-time assistance:

```txt
DOM summary + user intent + optional captured steps
→ MiniMax or local compiler
→ candidate ToolSchema
→ local validation
→ user review
→ local cache
```

AI must not run during replay.

Replay must remain:

```txt
cached schema
→ approval
→ deterministic content-script replay
→ audit
→ LLM calls: 0
```

## MiniMax Integration Requirements

The extension must not expose API keys.

MiniMax integration should go through a proxy:

```txt
VITE_AGENT_PROVIDER=minimax
VITE_MINIMAX_PROXY_URL=https://your-proxy.example.com
```

Expected endpoint:

```txt
POST /compile
```

Payload shape:

```ts
{
  intent: string;
  page: PageDomSummary;
  capturedSteps?: CapturedStep[];
}
```

Response shape:

```ts
{
  schema: ToolSchema;
  warnings: string[];
}
```

The extension must validate response shape before saving.

## Replay Requirements

For demo completion, replay should support:

- set text input
- set textarea
- set checkbox/radio
- set select/datalist by value
- click button/link
- basic table extraction
- approval before risk actions
- audit trace for every replay step

Known accepted limitations for demo:

- selectors may fail on highly dynamic apps
- multi-page replay beyond submit is not fully supported
- wait/navigation handling is basic
- no production security claims

## Implementation Plan

### Phase 1: UX Consolidation

- Replace visible `Inspect active page` primary flow with `Learn website`.
- Add intent prompt.
- Internally inspect active page before learning.
- Show candidate schema as `Suggested tool`.
- Keep `Show me once` as fallback.
- Move inspect details and captured workflow into `Advanced`.

### Phase 2: Prompt-to-Schema Local Compiler

- Add local compiler from `intent + PageDomSummary`.
- Infer tool name from intent/action button.
- Infer risk from intent/button labels.
- Infer params from page inputs.
- Infer types:
  - checkbox/radio → boolean
  - number/range → number
  - text/select/textarea/datalist → string
- Generate replay plan from inputs + action button.
- Emit warnings for missing buttons or dynamic selectors.

### Phase 3: MiniMax Compile Hook

- Extend MiniMax provider boundary to accept intent + page summary.
- Fall back to local compiler if MiniMax is not configured.
- Validate schema before preview/save.
- Audit whether compile used MiniMax or local fallback.

### Phase 4: Demo Polish

- Add concise demo script to README.
- Ensure Selenium web form flow works end-to-end.
- Ensure GitHub flow can be learned by demonstration without clicking final dangerous action.
- Make audit messages demo-friendly:
  - learned website
  - suggested tool
  - cached schema locally
  - approval requested
  - replay from cached schema
  - LLM calls during replay: 0

### Phase 5: Reliability Follow-up

After the demo is clean:

- selector candidates
- role/text/href-based replay resolver
- waitForElement
- waitForNavigation
- better parameter naming
- schema invalidation UI

## Demo Acceptance Criteria

The demo is complete when:

1. Extension loads from `dist/`.
2. User opens Selenium web form.
3. User enters an intent and clicks `Learn website`.
4. Graft Guard suggests a typed tool.
5. User saves the tool.
6. User fills tool inputs.
7. Approval appears.
8. Replay fills and submits the form.
9. Audit shows local cached replay and `LLM calls during replay: 0`.
10. Advanced details are available but not required for the main demo.

## Claims To Make

Safe claims:

- AI-assisted compile-time tool suggestion.
- Cached typed tools.
- Local deterministic replay.
- Approval guardrails.
- Audit trail.
- Zero LLM calls during replay.
- Demo targets stable form-based web workflows.

Avoid claims:

- works on every website
- production-grade security
- perfect selector stability
- full cross-page automation
- full compliance/RBAC
- replaces APIs

