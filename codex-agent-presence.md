# Task: Add a Visible AI Agent Persona to Graft Guard Extension

## Context

Graft Guard is a Chrome MV3 extension that compiles web workflows into typed, cached, guarded tools. The core pitch: "Learn once with AI, then replay locally with 0 LLM calls."

Currently the AI is invisible — it runs behind `websiteIntentCompiler.ts` and `commandParser.ts` but users never see it "speak" or "think." The extension feels like a mechanical tool, not an intelligent agent. We need to make the AI a visible participant in the workflow.

## Goal

Give the AI agent a persistent visual identity in the side panel. The agent should:
- Narrate what it's doing and why
- Explain its decisions (tool naming, risk level, selector warnings)
- Clearly distinguish "AI is working" vs "running from local cache, no AI needed"
- Feel like a collaborator, not a hidden backend

## Design: Agent Message Stream

Add an `AgentMessage` component that appears as a compact chat-style message in the panel. Messages are contextual — they appear at the right moment in the workflow, not in a separate chat window.

### Message types and when they appear:

**On page load (extension opens on a new site):**
```
🔍 I can see this page has [N] form fields and [M] buttons. 
   Ready to learn when you are.
```

**On "Learn this website" click (while compiling):**
```
🧠 Analyzing page structure...
   Found: [inputs list summary]
   Compiling a tool schema now.
```

**On successful compile:**
```
✅ I compiled [toolName] from this page.
   • [N] parameters detected
   • Risk level: [risk] — because [reason]
   • [warning count] warnings
   
   Review the schema below and save if it looks right.
```

**On compile with warnings:**
```
⚠️ I compiled [toolName] but I'm not confident about some selectors.
   Consider using "Show me once" so I can watch you do it.
```

**On "Show me once" start:**
```
👀 Recording your actions now. Do the workflow normally — 
   I'll figure out the tool schema from what you show me.
```

**On capture complete:**
```
✅ Got it. I saw [N] steps: [brief summary].
   Here's the tool I built from your demonstration.
```

**On tool run (from cache):**
```
⚡ Running [toolName] from local cache. No AI needed.
   Waiting for your approval...
```

**On tool run (with MiniMax parsing):**
```
🧠 I used AI to parse your command → [toolName]([params]).
   From here, replay is fully local.
```

**On approval granted:**
```
⚡ Approved. Replaying now — deterministic, no AI calls.
```

**On replay complete:**
```
✅ Done. Extracted [N] results.
   Total AI calls this run: 0
```

**On error/failure:**
```
❌ Replay failed at [step]. The page may have changed.
   Try "Show me once" to re-learn this workflow.
```

## Architecture

### New files:
```
src/ui/AgentMessage.tsx        — single message bubble component
src/ui/AgentMessageStream.tsx  — container showing latest messages
src/graft/agentNarrator.ts     — pure logic: given state transitions, produce message text
```

### Integration points:
```
src/App.tsx                    — call agentNarrator at each state transition, store messages
src/ui/ExtensionInspector.tsx  — embed AgentMessageStream above action buttons
src/ui/GraftPanel.tsx          — embed AgentMessageStream above tool list (extension mode only)
src/styles.css                 — agent message styles
```

### Data shape:
```ts
type AgentMessage = {
  id: string;
  timestamp: number;
  icon: "search" | "brain" | "check" | "warning" | "eye" | "bolt" | "error";
  text: string;          // main message, 1-2 lines
  detail?: string;       // collapsible extra info (reasoning, warnings)
  phase: "compile" | "replay" | "idle";
};
```

## Visual Design

- Messages appear in a compact stream at the top of the panel (max 3 visible, scrollable)
- Each message: icon + text, single-line or two-line max by default
- `detail` expands on click (for reasoning/warnings)
- Use a subtle background color to distinguish from the rest of the UI (e.g., light blue-gray)
- Font size slightly smaller than main UI (12px)
- Latest message is always visible; older ones collapse with "Show earlier" link
- No avatar/profile image — just the icon indicates agent state

## Visual Identity: AI vs Local

Two distinct visual treatments that reinforce the core pitch:

| State | Icon | Color accent | Label |
|-------|------|-------------|-------|
| AI working (compile/parse) | 🧠 brain | purple/violet | "AI-assisted" |
| Local replay (cached) | ⚡ bolt | green | "Local replay" |

This distinction should appear in:
- Agent messages (icon)
- Audit timeline entries (small badge)
- The tool card header after learning ("AI-compiled tool" vs later "Cached tool")

## Requirements

1. `agentNarrator.ts` is a pure function layer — no React, no side effects. Takes a state transition event, returns an `AgentMessage` or null.

2. Messages are generated at existing state transition points in `App.tsx` (where `addAudit` is already called). Do NOT restructure the app state — just add narrator calls alongside audit calls.

3. The narrator should use real data from the workflow:
   - Actual input count from `PageDomSummary`
   - Actual tool name from compiled schema
   - Actual risk reasoning (from `inferRisk` logic)
   - Actual warning text from `CandidateTool.warnings`

4. The non-extension (demo ERP) path may optionally show agent messages too, but keep it simpler — just "Compiled queryOrders" and "Replaying from cache" level messages.

5. Do not break existing functionality. Guard approval, audit log, replay engine — all unchanged.

6. Keep the panel width-friendly (~360px). Messages must not overflow or cause horizontal scroll.

7. No new dependencies.

## What NOT to Build

- Not a full chat interface — no user input to the agent message area
- Not a conversation history — only recent contextual messages
- Not a separate panel/tab — messages are inline in the existing flow
- No animated typing effect — messages appear instantly
- No sound or notification — purely visual

## Acceptance Criteria

- Opening extension on a new page shows an initial agent message about what it sees
- Clicking "Learn" shows the agent narrating its compile process
- Successful compile shows agent explaining its decisions (name, risk, warnings)
- Running a tool shows "Local replay, no AI" messaging
- Agent messages use distinct visual treatment for AI-phase vs cache-phase
- Audit timeline entries get a small AI/Local badge
- Panel remains usable at 360px width
- Demo ERP path still works
