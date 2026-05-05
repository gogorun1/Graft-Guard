import type { PageDomSummary } from "./pageSummary";

type CollectResponse =
  | { ok: true; summary: PageDomSummary }
  | { ok: false; error: string };

export function isExtensionRuntime(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

export async function collectActivePageSummary(): Promise<PageDomSummary> {
  if (!isExtensionRuntime()) {
    throw new Error("Graft Guard is running in standalone demo mode.");
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url) {
    throw new Error("No active tab is available.");
  }

  const tabId = tab.id;

  if (isRestrictedUrl(tab.url)) {
    throw new Error("Chrome does not allow extensions to inspect this page. Open a normal http or https page.");
  }

  const response = await sendCollectMessage(tabId).catch(async (error: unknown) => {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    await injectContentScript(tabId);
    return sendCollectMessage(tabId);
  });

  return response.summary;
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
