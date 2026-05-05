# Graft Guard

Graft Guard compiles stable web workflows into typed, cached, guarded tools.

The current project has two modes:

- Standalone hackathon demo with the fake Acme ERP app.
- Chrome MV3 extension shell that can inspect the active page through a content script.

## Run Standalone Demo

```bash
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:5173/
```

Demo flow:

1. Click `Learn this app`.
2. Review the generated `queryOrders` schema.
3. Run `Find all orders from last month over 1000 euros`.
4. Approve once.
5. Watch local replay fill the ERP form, click search, and extract table rows.
6. Confirm audit shows `LLM calls during replay: 0`.

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

The frontend expects a proxy when MiniMax is enabled:

```bash
VITE_AGENT_PROVIDER=minimax
VITE_MINIMAX_PROXY_URL=https://your-proxy.example.com
VITE_MINIMAX_MODEL=your-model-name
```

Expected proxy endpoints:

- `POST /compile`
- `POST /parse-command`

The proxy should own API keys, model selection, rate limits, retries, and provider logs. The extension keeps schema validation, approval, replay, and audit local.

## Current Scope

This is not a universal website automation product yet. The next target is stable internal web tools with form and table workflows.

Current implementation status:

- Acme ERP demo: working
- typed schema compiler boundary: working with deterministic local output
- local replay: working for the Acme demo
- approval guard and audit log: working
- extension manifest/content script/background: working
- active page DOM summary: working
- workflow capture: not implemented yet
- generic schema compiler: not implemented yet
- active-tab replay from extension: not implemented yet
- per-site cache/versioning: not implemented yet

