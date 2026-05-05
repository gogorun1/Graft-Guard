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

  if (!tab?.id) {
    throw new Error("No active tab is available.");
  }

  const response = (await chrome.tabs.sendMessage(tab.id, {
    type: "GRAFT_GUARD_COLLECT_PAGE",
  })) as CollectResponse;

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.summary;
}
