# PRD: Graft Guard Browser Extension MVP

## Product Direction

Build Graft Guard from a fixed demo app into a browser extension that can learn and replay stable workflows on internal, form-based web tools.

Positioning:

> Graft Guard compiles stable web workflows into typed, cached, guarded tools.

Do not claim support for every arbitrary website yet. The practical MVP target is:

> Stable internal web apps with forms, buttons, tables, and predictable post-login UI.

## Why This Exists

Many companies run critical workflows inside legacy web apps with no clean API. Current browser agents inspect and reason on every run, which is slow, expensive, and risky. Graft Guard should let a user demonstrate a workflow once, compile it into a typed tool, cache it per site, and replay it locally with approval and audit logs.

## MVP Goals

1. Package Graft Guard as a Chrome-compatible MV3 extension.
2. Inject a content script into the active tab.
3. Collect a safe DOM summary from the current page.
4. Show the summary in the extension side panel.
5. Learn a first candidate tool from the observed page.
6. Store learned tools per origin and page fingerprint.
7. Replay simple form/table workflows through the content script.
8. Require approval before every read/export/write action.
9. Keep an audit trail that makes local replay and LLM call count visible.
10. Leave a MiniMax API provider boundary for schema suggestion and command parsing.

## Non-Goals

- Do not promise support for every website.
- Do not support payment, banking, medical, government, or destructive workflows in the MVP.
- Do not bypass login, captcha, anti-bot systems, or permissions.
- Do not put MiniMax or other provider API keys in the browser extension.
- Do not trust model output without schema validation.
- Do not build full enterprise policy/RBAC in this phase.

## Extension Architecture

```txt
extension side panel
  React UI
  tool schema viewer
  approval card
  replay trace
  audit timeline

content script
  DOM summary collector
  workflow event recorder
  replay executor
  table extractor

background service worker
  side panel registration
  message routing
  future sync/export hooks

optional backend proxy
  MiniMax API calls
  schema suggestion
  command parsing
  API key isolation
```

## Phase 1: Extension Shell

Deliverables:

- `public/manifest.json`
- `src/extension/contentScript.ts`
- `src/extension/background.ts`
- side panel can query active tab
- content script returns page summary
- app still runs standalone for the Acme demo

Acceptance:

- `npm run build` produces extension-ready `dist/`
- Chrome can load `dist/` as an unpacked extension
- side panel shows the active page title, origin, forms, buttons, inputs, and tables

## Phase 2: Workflow Capture

Deliverables:

- record mode in content script
- capture typed input, selected controls, clicked buttons
- ignore passwords and sensitive fields
- produce a replay candidate:

```ts
type CapturedStep =
  | { type: "setValue"; selector: string; label?: string; valuePreview: string }
  | { type: "click"; selector: string; label?: string }
  | { type: "extractTable"; selector: string; headers: string[] };
```

Acceptance:

- user can click "Start capture"
- perform a simple search workflow
- click "Stop capture"
- panel shows a candidate typed tool and replay plan

## Phase 3: Compiler Boundary

Deliverables:

- deterministic local compiler for common form/table workflows
- MiniMax provider hook for schema suggestion
- schema validator
- tool risk classifier

Compiler inputs:

- DOM summary
- captured steps
- page title/origin
- user-provided tool name or intent

Compiler output:

- `ToolSchema[]`
- replay plan
- extraction plan
- risk
- confidence and warnings

Acceptance:

- local compiler works without MiniMax
- MiniMax can be enabled through proxy config
- invalid schemas are rejected before storage

## Phase 4: Per-Site Cache

Deliverables:

- cache tools by origin + page fingerprint
- schema versioning
- invalidation when page fingerprint changes
- UI warning when replay target differs from learned page

Acceptance:

- tools learned on one origin do not leak into another origin
- reload keeps learned tools
- changed page structure prompts relearn or review

## Phase 5: Guarded Replay

Deliverables:

- replay request from side panel to content script
- selector resolver with fallbacks
- wait conditions after clicks
- extraction result returned to side panel
- approval required before action
- audit events for every step

Acceptance:

- simple workflows replay on target pages
- failed selectors produce actionable errors
- replay uses cached schema and shows `LLM calls: 0`

## Security Requirements

- Never collect password values.
- Never collect hidden input values by default.
- Mark downloads and exports as high risk.
- Block destructive actions by default unless explicitly enabled for demo.
- Keep provider API keys out of extension code.
- Show the user what page/origin a tool was learned from.
- Audit approval decisions and replay failures.

## MiniMax Integration Boundary

The extension talks only to a user-controlled proxy:

```txt
VITE_AGENT_PROVIDER=minimax
VITE_MINIMAX_PROXY_URL=https://example.com/graft-minimax
```

Expected proxy endpoints:

- `POST /compile`
- `POST /parse-command`

The proxy owns:

- MiniMax API key
- model selection
- rate limits
- request logging
- provider-specific retries

The extension owns:

- DOM summary
- schema validation
- risk classification
- approval
- replay
- audit

## First Implementation Slice

Start with Phase 1:

1. Add extension manifest and build outputs.
2. Add content script DOM summary collector.
3. Add background service worker.
4. Add extension client in the React app.
5. Keep Acme ERP demo available in standalone mode.
6. Commit each completed slice.

## Demo Script

1. Load `dist/` as unpacked extension.
2. Open a stable form/table webpage.
3. Open Graft Guard side panel.
4. Click "Inspect active page".
5. Show detected forms, inputs, buttons, and tables.
6. Say:

> This is the extension bridge. Next, capture turns this page into a typed guarded tool.

