# Graft Guard Hackathon Agent Priorities

## Core Agentic Claim

The most important agentic moment is not replay. It is compiling a user's intent and the current website structure into a trustworthy typed tool.

```txt
Describe what you want to automate
-> Confirm and compile
-> MiniMax understands the page and goal
-> Graft Guard normalizes that understanding into a typed tool
-> User reviews and saves the tool
```

Replay should intentionally be less agentic: cached tool execution, approval gates, audit trail, and zero LLM calls during replay.

## Hackathon Narrative

Graft Guard uses an agent once to learn a website workflow, then turns it into a typed, guarded, cached local tool.

```txt
AI learns the workflow once.
Graft Guard validates and saves it as a tool.
Future runs are local, governed, and auditable.
```

## P0: Must Land

1. MiniMax compile is real in the main flow.
   - `Confirm and compile` calls the MiniMax-backed compiler proxy when configured.
   - The compile input is user intent plus active page summary.
   - The frontend clearly shows MiniMax versus local fallback.

2. Suggested tool shows agent understanding.
   - Show function signature.
   - Show risk level.
   - Show a short reason derived from MiniMax output or local fallback notes.
   - Make risky actions such as submit, export, delete, and bank details visible.

3. Saved replay is stable.
   - User can save the suggested tool.
   - User can fill generated tool inputs.
   - Risky tools request approval.
   - Replay runs against the active page with `LLM calls: 0`.

## P1: Strong Demo Boost

1. Use a high-risk business workflow as the main demo.
   - Vendor payments, overdue invoices, bank details, or approval-sensitive exports make Guard's value obvious.

2. Keep MiniMax at the semantic layer.
   - MiniMax outputs `AgentDraft`.
   - Graft Guard normalizes that draft into internal tools and executable replay plans.
   - The model should not directly own final selectors or browser execution.

3. Keep fallback available but secondary.
   - `Record actions` appears only for warnings, errors, or active recording.
   - The fallback story is: if the agent is unsure, show the workflow once.

## P2: Time Permitting

1. Diagnostics polish.
   - Keep page summary, fingerprint, captured steps, and cached schema visible in the folded diagnostics panel.

2. Cache and versioning.
   - Show saved tools as compiled and cached.
   - Defer full version management unless the demo needs it.

3. Broader website support.
   - Two reliable examples are better than broad but fragile coverage.
   - Recommended examples: a standard form and a guarded business workflow.

## Recommended Demo Script

1. Open the ERP or target form page.
2. Open the extension.
3. Enter a goal, or use the default form-submission goal.
4. Click `Confirm and compile`.
5. Show `Compiled by MiniMax`.
6. Show the suggested function signature, risk, and reason.
7. Save the tool.
8. Run the saved tool.
9. Approve or deny if Guard requests approval.
10. Show replay trace and `LLM calls: 0`.

