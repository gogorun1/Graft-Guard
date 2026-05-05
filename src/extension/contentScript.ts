import type {
  BackgroundMessage,
  ExtensionMessage,
  CapturedStep,
  PageButtonSummary,
  PageDomSummary,
  PageFormSummary,
  PageInputSummary,
  PageTableSummary,
} from "./pageSummary";
import type { ReplayResult, ReplayStep, ReplayTrace } from "../graft/schemaTypes";

let isCapturing = false;
let capturedSteps: CapturedStep[] = [];
let lastInputBySelector = new Map<string, CapturedStep>();

void resumeCaptureIfSessionActive();

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "GRAFT_GUARD_COLLECT_PAGE") {
    sendResponse({ ok: true, summary: collectPageSummary() });
    return true;
  }

  if (message.type === "GRAFT_GUARD_START_CAPTURE") {
    startCapture();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GRAFT_GUARD_STOP_CAPTURE") {
    const steps = stopCapture();
    sendResponse({ ok: true, steps });
    return true;
  }

  if (message.type === "GRAFT_GUARD_REPLAY_TOOL") {
    void replayToolOnPage(message.schema.replayPlan, message.params)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true;
  }

  return false;
});

function startCapture() {
  stopCapture();
  capturedSteps = [];
  lastInputBySelector = new Map();
  isCapturing = true;
  document.addEventListener("input", handleCapturedInput, true);
  document.addEventListener("change", handleCapturedInput, true);
  document.addEventListener("click", handleCapturedClick, true);
}

function stopCapture(): CapturedStep[] {
  isCapturing = false;
  document.removeEventListener("input", handleCapturedInput, true);
  document.removeEventListener("change", handleCapturedInput, true);
  document.removeEventListener("click", handleCapturedClick, true);

  return capturedSteps;
}

function handleCapturedInput(event: Event) {
  if (!isCapturing || !(event.target instanceof HTMLElement)) {
    return;
  }

  const target = event.target;

  if (!isInputElement(target) || isSensitiveInput(target)) {
    return;
  }

  const selector = bestSelector(target);
  const step: CapturedStep = {
    type: "setValue",
    selector,
    label: findLabel(target),
    inputType: inputType(target),
    valuePreview: previewInputValue(target),
  };

  const previous = lastInputBySelector.get(selector);
  if (previous) {
    const index = capturedSteps.indexOf(previous);
    if (index >= 0) {
      capturedSteps[index] = step;
    }
  } else {
    capturedSteps.push(step);
  }

  lastInputBySelector.set(selector, step);
  reportCapturedStep(step);
}

function handleCapturedClick(event: MouseEvent) {
  if (!isCapturing || !(event.target instanceof HTMLElement)) {
    return;
  }

  const target = event.target.closest<HTMLElement>("button, input[type='button'], input[type='submit'], a[href]");
  if (!target || !isVisible(target)) {
    return;
  }

  const step: CapturedStep = {
    type: "click",
    selector: bestSelector(target),
    label: visibleText(target),
    tagName: target.tagName.toLowerCase(),
  };

  capturedSteps.push(step);
  reportCapturedStep(step);
}

async function resumeCaptureIfSessionActive() {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "GRAFT_GUARD_CAPTURE_STATUS",
    } satisfies BackgroundMessage)) as { ok: true; active: boolean };

    if (response.active) {
      startCapture();
    }
  } catch {
    // Content script can load before the background service worker is ready.
  }
}

function reportCapturedStep(step: CapturedStep) {
  void chrome.runtime.sendMessage({
    type: "GRAFT_GUARD_CAPTURE_STEP",
    step,
  } satisfies BackgroundMessage);
}

async function replayToolOnPage(
  replayPlan: ReplayStep[],
  params: Record<string, unknown>,
): Promise<ReplayResult> {
  const trace: ReplayTrace[] = [];
  let rows: Record<string, string | number>[] = [];

  for (const step of replayPlan) {
    if (step.type === "setValue") {
      const element = queryReplayElement(step.selector);
      setElementValue(element, params[step.valueFrom]);
      trace.push({ step, message: `Set ${step.selector} from ${step.valueFrom}` });
      await sleep(75);
    }

    if (step.type === "click") {
      queryReplayElement<HTMLElement>(step.selector).click();
      trace.push({ step, message: `Clicked ${step.selector}` });
      await sleep(100);
    }

    if (step.type === "extractTable") {
      rows = extractTable(step.selector);
      trace.push({ step, message: `Extracted ${rows.length} rows from ${step.selector}` });
      await sleep(50);
    }
  }

  return { rows, trace, llmCalls: 0 };
}

function setElementValue(element: Element, value: unknown) {
  if (!(element instanceof HTMLElement) || !isInputElement(element)) {
    throw new Error(`Replay target is not an input: ${elementToSelectorLabel(element)}`);
  }

  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    element.checked = value === true || value === "true" || value === "checked" || value === "on";
  } else {
    element.value = String(value ?? "");
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function queryReplayElement<T extends Element = Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Replay selector not found: ${selector}`);
  }

  return element as T;
}

function extractTable(selector: string): Record<string, string | number>[] {
  const table = queryReplayElement<HTMLTableElement>(selector);
  const headers = Array.from(table.querySelectorAll("thead th, tr:first-child th, tr:first-child td")).map((cell) =>
    normalizeKey(cell.textContent ?? ""),
  );

  return Array.from(table.querySelectorAll("tbody tr")).map((row) => {
    const values = Array.from(row.querySelectorAll("td"));
    return headers.reduce<Record<string, string | number>>((record, key, index) => {
      const value = values[index]?.textContent?.trim() ?? "";
      record[key] = key === "amount" ? Number(value.replace(/[^\d.]/g, "")) : value;
      return record;
    }, {});
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "_");
}

function elementToSelectorLabel(element: Element): string {
  return element.id ? `#${element.id}` : element.tagName.toLowerCase();
}

function collectPageSummary(): PageDomSummary {
  const inputs = visibleElements<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "input, select, textarea",
  )
    .filter((input) => !isSensitiveInput(input))
    .slice(0, 80)
    .map(summarizeInput);

  const buttons = visibleElements<HTMLButtonElement | HTMLInputElement | HTMLAnchorElement>(
    "button, input[type='button'], input[type='submit'], a[href]",
  )
    .slice(0, 80)
    .map(summarizeButton)
    .filter((button) => button.text.length > 0);

  const tables = visibleElements<HTMLTableElement>("table").slice(0, 20).map(summarizeTable);
  const forms = visibleElements<HTMLFormElement>("form").slice(0, 30).map(summarizeForm);

  return {
    title: document.title || "(untitled page)",
    url: window.location.href,
    origin: window.location.origin,
    fingerprint: createFingerprint(inputs, buttons, tables),
    forms,
    inputs,
    buttons,
    tables,
  };
}

function summarizeInput(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): PageInputSummary {
  return {
    selector: bestSelector(element),
    label: findLabel(element),
    type: inputType(element),
    name: element.getAttribute("name") ?? undefined,
    placeholder: element.getAttribute("placeholder") ?? undefined,
    required: element.hasAttribute("required"),
  };
}

function summarizeButton(element: HTMLButtonElement | HTMLInputElement | HTMLAnchorElement): PageButtonSummary {
  return {
    selector: bestSelector(element),
    text: visibleText(element),
    type: element.getAttribute("type") ?? undefined,
  };
}

function summarizeTable(table: HTMLTableElement): PageTableSummary {
  const headers = Array.from(table.querySelectorAll("thead th, tr:first-child th, tr:first-child td"))
    .map((cell) => cleanText(cell.textContent ?? ""))
    .filter(Boolean)
    .slice(0, 20);

  return {
    selector: bestSelector(table),
    headers,
    rowCount: table.querySelectorAll("tbody tr").length || Math.max(0, table.querySelectorAll("tr").length - 1),
  };
}

function summarizeForm(form: HTMLFormElement): PageFormSummary {
  return {
    selector: bestSelector(form),
    inputCount: form.querySelectorAll("input, select, textarea").length,
    buttonCount: form.querySelectorAll("button, input[type='button'], input[type='submit']").length,
  };
}

function visibleElements<T extends HTMLElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector)).filter(isVisible);
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function isInputElement(
  element: HTMLElement,
): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement;
}

function isSensitiveInput(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  const type = element.type.toLowerCase();
  const name = `${element.name} ${element.id} ${element.placeholder}`.toLowerCase();
  return type === "password" || type === "hidden" || /token|secret|password|credential/.test(name);
}

function inputType(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  if (element instanceof HTMLInputElement) {
    return element.type || "text";
  }

  return element.tagName.toLowerCase();
}

function previewInputValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    return element.checked ? "checked" : "unchecked";
  }

  const value = element.value;
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

function findLabel(element: HTMLElement): string | undefined {
  const aria = element.getAttribute("aria-label");
  if (aria) {
    return cleanText(aria);
  }

  const id = element.getAttribute("id");
  if (id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${cssEscape(id)}"]`);
    if (label?.textContent) {
      return cleanText(label.textContent);
    }
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel?.textContent) {
    return cleanText(wrappingLabel.textContent);
  }

  return undefined;
}

function visibleText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    return cleanText(element.value || element.getAttribute("aria-label") || element.name || element.type);
  }

  return cleanText(element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "");
}

function bestSelector(element: HTMLElement): string {
  const id = element.getAttribute("id");
  if (id) {
    return `#${cssEscape(id)}`;
  }

  const testId = element.getAttribute("data-testid") || element.getAttribute("data-test");
  if (testId) {
    return `[data-testid="${cssEscape(testId)}"]`;
  }

  const name = element.getAttribute("name");
  if (name) {
    return `${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
  }

  return cssPath(element);
}

function cssPath(element: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== document.body && parts.length < 5) {
    const tag = current.tagName.toLowerCase();
    const parentElement: HTMLElement | null = current.parentElement;
    if (!parentElement) {
      break;
    }

    const siblings = Array.from(parentElement.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === current?.tagName,
    );
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parentElement;
  }

  return parts.join(" > ");
}

function createFingerprint(
  inputs: PageInputSummary[],
  buttons: PageButtonSummary[],
  tables: PageTableSummary[],
): string {
  const raw = JSON.stringify({
    path: window.location.pathname,
    inputs: inputs.map((input) => [input.selector, input.label, input.type]),
    buttons: buttons.map((button) => [button.selector, button.text]),
    tables: tables.map((table) => [table.selector, table.headers]),
  });

  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16);
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cssEscape(value: string): string {
  if (globalThis.CSS?.escape) {
    return globalThis.CSS.escape(value);
  }

  return value.replace(/["\\#.:,[\]>+~*']/g, "\\$&");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
