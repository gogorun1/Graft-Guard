# Task: Simplify Graft Guard Extension UX to "Learn → Review → Save → Run"

## Context

Graft Guard is a Chrome MV3 extension that compiles web workflows into typed, cached, guarded tools. The core value is: learn a website once, then replay a deterministic tool locally with 0 LLM calls.

The current extension UI exposes too many internal engineering steps (Inspect, Capture, Generate Schema, etc.) as separate buttons. Users should experience a single streamlined flow.

## Current Problem

In `src/ui/ExtensionInspector.tsx`, users see:
- "Inspect page" button (collects DOM summary)
- "Learn website" button (intent-based schema from DOM)
- "Start capture" / "Stop capture" buttons (record workflow)
- "Generate schema" button (compile captured steps)
- "Save tool" button

This is confusing. The user flow should be:

```
1. Click "Learn this website" → internally does inspect + intent compile
2. Review the suggested tool schema + warnings
3. Click "Save" → tool is cached per origin
4. Run the tool from GraftPanel with params → guard approval → replay
```

The "Show me once" (capture workflow) should be a secondary/fallback path, surfaced only when the initial intent-compile fails or produces warnings.

## Files to Modify

```
src/ui/ExtensionInspector.tsx   — main file to simplify
src/ui/GraftPanel.tsx           — may need minor adjustments
src/App.tsx                     — simplify state/handlers if UI flow changes
src/styles.css                  — clean up any orphaned styles
```

## Requirements

1. **Primary flow: "Learn this website"**
   - Single button triggers: inspect DOM → compile intent → show candidate schema
   - If successful with no critical warnings, show the schema + "Save tool" button
   - If warnings exist, show them inline with a suggestion to use "Show me once"

2. **Secondary flow: "Show me once"**
   - Only visible after Learn fails or user explicitly expands an "Advanced" section
   - Combines start/stop capture + auto-generate schema into a cleaner 2-step: "Start recording" → "Done" → auto-shows candidate

3. **Remove from default view:**
   - "Inspect page" as a standalone button (fold it into Learn)
   - "Generate schema" as a standalone button (auto-trigger after capture stops)
   - Raw DOM summary display (move to a collapsible debug section)

4. **Keep the existing logic** in `capturedWorkflowCompiler.ts`, `websiteIntentCompiler.ts`, and `targetPageClient.ts`. Only change the UI layer and App.tsx orchestration.

5. **Do not break** the non-extension (demo ERP) path. The `!isExtension` branch in App.tsx should remain unchanged.

## Design Direction

- Extension panel width is narrow (~360px). Keep UI compact.
- Use clear state indicators: "Learning...", "Recording your workflow...", "Ready to save"
- The saved tools list in GraftPanel should be the hero after learning. Users spend most time there.
- Approval card and audit timeline remain as-is.

## Tech Stack

- React + TypeScript
- Vite
- No component library — plain CSS in `src/styles.css`

## Acceptance Criteria

- Opening extension on a new page shows one clear CTA: "Learn this website"
- After learning, user sees candidate tool + Save button (or warnings + fallback path)
- After saving, tool appears in GraftPanel ready to run
- "Show me once" is accessible but not the default path
- The demo ERP local flow still works unchanged
- No new dependencies
