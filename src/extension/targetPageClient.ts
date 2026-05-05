import type { BackgroundMessage, CapturedStep, PageDomSummary } from "./pageSummary";
import type { ReplayResult, ToolSchema } from "../graft/schemaTypes";

type CollectResponse =
  | { ok: true; summary: PageDomSummary }
  | { ok: false; error: string };

type CaptureResponse =
  | { ok: true; steps: CapturedStep[] }
  | { ok: false; error: string };

type ReplayResponse =
  | { ok: true; result: ReplayResult }
  | { ok: false; error: string };

export function isExtensionRuntime(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

export async function collectActivePageSummary(): Promise<PageDomSummary> {
  const tab = await getInspectableActiveTab();
  const response = await withInjectedContentScript(tab.id, () => sendCollectMessage(tab.id));
  return response.summary;
}

export async function startActivePageCapture(): Promise<void> {
  const tab = await getInspectableActiveTab();
  await chrome.runtime.sendMessage({
    type: "GRAFT_GUARD_START_CAPTURE_SESSION",
    tabId: tab.id,
  } satisfies BackgroundMessage);
  await withInjectedContentScript(tab.id, () =>
    chrome.tabs.sendMessage(tab.id, {
      type: "GRAFT_GUARD_START_CAPTURE",
    }),
  );
}

export async function stopActivePageCapture(): Promise<CapturedStep[]> {
  const tab = await getInspectableActiveTab();
  await withInjectedContentScript(tab.id, () =>
    chrome.tabs.sendMessage(tab.id, {
      type: "GRAFT_GUARD_STOP_CAPTURE",
    }),
  ).catch(() => undefined);

  const response = (await chrome.runtime.sendMessage({
    type: "GRAFT_GUARD_STOP_CAPTURE_SESSION",
    tabId: tab.id,
  } satisfies BackgroundMessage)) as CaptureResponse;

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.steps;
}

export async function replayActivePageTool(
  schema: ToolSchema,
  params: Record<string, unknown>,
): Promise<ReplayResult> {
  const tab = await getInspectableActiveTab();
  const response = (await withInjectedContentScript(tab.id, () =>
    chrome.tabs.sendMessage(tab.id, {
      type: "GRAFT_GUARD_REPLAY_TOOL",
      schema,
      params,
    }),
  )) as ReplayResponse;

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.result;
}

async function getInspectableActiveTab(): Promise<{ id: number; url: string }> {
  if (!isExtensionRuntime()) {
    throw new Error("Graft Guard is running in standalone demo mode.");
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url) {
    throw new Error("No active tab is available.");
  }

  if (isRestrictedUrl(tab.url)) {
    throw new Error("Chrome does not allow extensions to inspect this page. Open a normal http or https page.");
  }

  return { id: tab.id, url: tab.url };
}

async function withInjectedContentScript<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
  return operation().catch(async (error: unknown) => {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    await injectContentScript(tabId);
    return operation();
  });
}

async function sendCollectMessage(tabId: number): Promise<{ ok: true; summary: PageDomSummary }> {
  const response = (await chrome.tabs.sendMessage(tabId, {
    type: "GRAFT_GUARD_COLLECT_PAGE",
  })) as CollectResponse;

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response;
}

async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["assets/contentScript.js"],
    });
  } catch (error) {
    throw new Error(`Could not inject Graft Guard into this page: ${errorMessage(error)}`);
  }
}

function isMissingReceiverError(error: unknown): boolean {
  return errorMessage(error).includes("Receiving end does not exist");
}

function isRestrictedUrl(url: string): boolean {
  return /^(chrome|edge|about|devtools|chrome-extension):\/\//.test(url);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
