import type { BackgroundMessage, CapturedStep } from "./pageSummary";

type CaptureSession = {
  tabId: number;
  startedAt: string;
  steps: CapturedStep[];
};

let captureSession: CaptureSession | undefined;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId === undefined) {
    return;
  }

  await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  if (message.type === "GRAFT_GUARD_START_CAPTURE_SESSION") {
    captureSession = {
      tabId: message.tabId,
      startedAt: new Date().toISOString(),
      steps: [],
    };
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GRAFT_GUARD_STOP_CAPTURE_SESSION") {
    const steps = captureSession?.tabId === message.tabId ? captureSession.steps : [];
    captureSession = undefined;
    sendResponse({ ok: true, steps });
    return true;
  }

  if (message.type === "GRAFT_GUARD_CAPTURE_STATUS") {
    sendResponse({ ok: true, active: Boolean(captureSession && sender.tab?.id === captureSession.tabId) });
    return true;
  }

  if (message.type === "GRAFT_GUARD_CAPTURE_STEP") {
    if (captureSession && sender.tab?.id === captureSession.tabId) {
      captureSession.steps = appendCapturedStep(captureSession.steps, message.step);
    }
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

function appendCapturedStep(steps: CapturedStep[], step: CapturedStep): CapturedStep[] {
  if (step.type !== "setValue") {
    return [...steps, step];
  }

  const existingIndex = steps.findIndex(
    (candidate) => candidate.type === "setValue" && candidate.selector === step.selector,
  );

  if (existingIndex === -1) {
    return [...steps, step];
  }

  return steps.map((candidate, index) => (index === existingIndex ? step : candidate));
}
