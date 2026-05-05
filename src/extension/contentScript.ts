import type {
  BackgroundMessage,
  ExtensionMessage,
  CapturedStep,
  PageButtonSummary,
  PageDomSummary,
  PageFormSummary,
  PageInputSummary,
  PageRegionSummary,
  PageTableSummary,
} from "./pageSummary";
import type { LocatorSpec, ReplayResult, ReplayStep, ReplayTrace } from "../graft/schemaTypes";

let isCapturing = false;
let capturedSteps: CapturedStep[] = [];
let lastInputBySelector = new Map<string, CapturedStep>();

type InputLikeElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLElement;
type TableLikeElement = HTMLTableElement | HTMLElement;

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

  if (!isEditableElement(target) || isSensitiveInput(target)) {
    return;
  }

  const selector = bestSelector(target);
  const step: CapturedStep = {
    type: "setValue",
    selector,
    locator: locatorForElement(target),
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

  const target = event.target.closest<HTMLElement>(
    "button, input[type='button'], input[type='submit'], a[href], [role='button'], [role='menuitem'], [role='option'], [role='tab'], [aria-haspopup], summary",
  );
  if (!target || !isVisible(target)) {
    return;
  }

  const step: CapturedStep = {
    type: "click",
    selector: bestSelector(target),
    locator: locatorForElement(target),
    label: visibleText(target),
    tagName: target.tagName.toLowerCase(),
  };

  capturedSteps.push(step);
  reportCapturedStep(step);
}

async function resumeCaptureIfSessionActive() {
  const response = await sendRuntimeMessage<{ ok: true; active: boolean }>({
    type: "GRAFT_GUARD_CAPTURE_STATUS",
  } satisfies BackgroundMessage);

  if (response?.active) {
    startCapture();
  }
}

function reportCapturedStep(step: CapturedStep) {
  void sendRuntimeMessage({
    type: "GRAFT_GUARD_CAPTURE_STEP",
    step,
  } satisfies BackgroundMessage);
}

async function sendRuntimeMessage<T>(message: BackgroundMessage): Promise<T | undefined> {
  try {
    if (!isRuntimeAvailable()) {
      stopCapture();
      return undefined;
    }

    return (await chrome.runtime.sendMessage(message)) as T;
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      stopCapture();
      return undefined;
    }

    // The background service worker can be waking up or unavailable during tab transitions.
    return undefined;
  }
}

function isRuntimeAvailable(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function isExtensionContextInvalidated(error: unknown): boolean {
  return errorMessage(error).includes("Extension context invalidated");
}

async function replayToolOnPage(
  replayPlan: ReplayStep[],
  params: Record<string, unknown>,
): Promise<ReplayResult> {
  const trace: ReplayTrace[] = [];
  let rows: Record<string, string | number>[] = [];

  for (const step of replayPlan) {
    if (step.type === "setValue") {
      const element = resolveReplayElement(step);
      setElementValue(element, params[step.valueFrom]);
      trace.push({ step, message: `Set ${replayTargetLabel(step)} from ${step.valueFrom}` });
      await sleep(75);
    }

    if (step.type === "click") {
      resolveReplayElement<HTMLElement>(step).click();
      trace.push({ step, message: `Clicked ${replayTargetLabel(step)}` });
      await sleep(100);
    }

    if (step.type === "extractTable") {
      rows = extractTable(step);
      trace.push({ step, message: `Extracted ${rows.length} rows from ${replayTargetLabel(step)}` });
      await sleep(50);
    }
  }

  return { rows, trace, llmCalls: 0 };
}

function setElementValue(element: Element, value: unknown) {
  if (!(element instanceof HTMLElement) || !isEditableElement(element)) {
    throw new Error(`Replay target is not an input: ${elementToSelectorLabel(element)}`);
  }

  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    element.checked = value === true || value === "true" || value === "checked" || value === "on";
  } else if (element instanceof HTMLInputElement) {
    element.value = normalizeInputValue(element, value);
  } else if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    element.value = String(value ?? "");
  } else if (["checkbox", "radio", "switch"].includes(element.getAttribute("role") ?? "")) {
    const desired = value === true || value === "true" || value === "checked" || value === "on";
    const current = element.getAttribute("aria-checked") === "true";
    if (desired !== current) {
      element.click();
    }
  } else if (element.isContentEditable || ["textbox", "searchbox", "combobox", "spinbutton"].includes(element.getAttribute("role") ?? "")) {
    element.textContent = String(value ?? "");
  } else {
    throw new Error(`Replay target is not editable: ${elementToSelectorLabel(element)}`);
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function normalizeInputValue(target: HTMLInputElement, value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (target.type === "date") {
    return normalizeDateValue(value);
  }

  if (target.type === "number" || target.type === "range") {
    const numberValue = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(numberValue) ? String(numberValue) : "";
  }

  return String(value);
}

function normalizeDateValue(value: unknown): string {
  if (typeof value === "string") {
    const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoMatch) {
      return isoMatch[0];
    }
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function resolveReplayElement<T extends Element = Element>(step: ReplayStep): T {
  const element = queryReplayElement<T>(step.selector) ?? findElementByLocator<T>(step.locator);
  if (!element) {
    throw new Error(`Replay target not found: ${replayTargetLabel(step)}`);
  }

  return element;
}

function queryReplayElement<T extends Element = Element>(selector: string): T | undefined {
  if (!selector) {
    return undefined;
  }

  try {
    return querySelectorDeep<T>(selector);
  } catch {
    return undefined;
  }
}

function extractTable(step: Extract<ReplayStep, { type: "extractTable" }>): Record<string, string | number>[] {
  const table = resolveReplayElement<TableLikeElement>(step);
  const headers = Array.from(table.querySelectorAll("thead th, [role='columnheader'], tr:first-child th, tr:first-child td, [role='row']:first-child [role='cell']")).map((cell) =>
    normalizeKey(cell.textContent ?? ""),
  );

  const rows = Array.from(table.querySelectorAll("tbody tr, [role='row']")).slice(headers.length > 0 ? 1 : 0);
  return rows.map((row) => {
    const values = Array.from(row.querySelectorAll("td, [role='cell'], [role='gridcell']"));
    return headers.reduce<Record<string, string | number>>((record, key, index) => {
      const value = values[index]?.textContent?.trim() ?? "";
      record[key] = key === "amount" ? Number(value.replace(/[^\d.]/g, "")) : value;
      return record;
    }, {});
  });
}

function replayTargetLabel(step: ReplayStep): string {
  return step.locator?.name || step.locator?.label || step.locator?.text || step.selector;
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
  const inputs = visibleElements<InputLikeElement>(
    [
      "input",
      "select",
      "textarea",
      "[contenteditable='true']",
      "[role='textbox']",
      "[role='searchbox']",
      "[role='combobox']",
      "[role='spinbutton']",
      "[role='checkbox']",
      "[role='radio']",
      "[role='switch']",
    ].join(", "),
  )
    .filter((input) => !isSensitiveInput(input))
    .slice(0, 80)
    .map(summarizeInput);

  const buttons = visibleElements<HTMLElement>(
    [
      "button",
      "input[type='button']",
      "input[type='submit']",
      "a[href]",
      "[role='button']",
      "[role='menuitem']",
      "[role='option']",
      "[role='tab']",
      "[aria-haspopup]",
      "summary",
    ].join(", "),
  )
    .slice(0, 80)
    .map(summarizeButton)
    .filter((button) => button.text.length > 0);

  const tables = visibleElements<TableLikeElement>("table, [role='table'], [role='grid']").slice(0, 20).map(summarizeTable);
  const forms = visibleElements<HTMLFormElement>("form").slice(0, 30).map(summarizeForm);
  const regions = visibleElements<HTMLElement>(
    [
      "main",
      "nav",
      "aside",
      "section",
      "[role='main']",
      "[role='navigation']",
      "[role='dialog']",
      "[role='region']",
      "[role='search']",
      "[role='form']",
      "[role='toolbar']",
      "[role='listbox']",
      "[role='menu']",
    ].join(", "),
  )
    .slice(0, 30)
    .map(summarizeRegion)
    .filter((region) => region.textPreview.length > 0 || Boolean(region.label));

  return {
    title: document.title || "(untitled page)",
    url: window.location.href,
    origin: window.location.origin,
    fingerprint: createFingerprint(inputs, buttons, tables, regions),
    forms,
    inputs,
    buttons,
    tables,
    regions,
  };
}

function summarizeInput(element: InputLikeElement): PageInputSummary {
  return {
    selector: bestSelector(element),
    locator: locatorForElement(element),
    label: findLabel(element),
    type: inputType(element),
    role: element.getAttribute("role") ?? undefined,
    name: element.getAttribute("name") ?? undefined,
    placeholder: element.getAttribute("placeholder") ?? undefined,
    required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
    options: summarizeInputOptions(element),
  };
}

function summarizeButton(element: HTMLElement): PageButtonSummary {
  return {
    selector: bestSelector(element),
    locator: locatorForElement(element),
    text: visibleText(element),
    type: element.getAttribute("type") ?? undefined,
    role: element.getAttribute("role") ?? undefined,
  };
}

function summarizeTable(table: TableLikeElement): PageTableSummary {
  const headers = Array.from(table.querySelectorAll("thead th, [role='columnheader'], tr:first-child th, tr:first-child td, [role='row']:first-child [role='cell']"))
    .map((cell) => cleanText(cell.textContent ?? ""))
    .filter(Boolean)
    .slice(0, 20);

  const semanticRows = table.querySelectorAll("[role='row']").length;
  return {
    selector: bestSelector(table),
    locator: locatorForElement(table),
    headers,
    rowCount: table.querySelectorAll("tbody tr").length || Math.max(0, table.querySelectorAll("tr").length - 1) || Math.max(0, semanticRows - 1),
  };
}

function summarizeForm(form: HTMLFormElement): PageFormSummary {
  return {
    selector: bestSelector(form),
    locator: locatorForElement(form),
    inputCount: form.querySelectorAll("input, select, textarea").length,
    buttonCount: form.querySelectorAll("button, input[type='button'], input[type='submit']").length,
  };
}

function summarizeRegion(element: HTMLElement): PageRegionSummary {
  return {
    selector: bestSelector(element),
    locator: locatorForElement(element),
    role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
    label: findLabel(element),
    textPreview: previewText(element),
  };
}

function visibleElements<T extends HTMLElement>(selector: string): T[] {
  return querySelectorAllDeep<T>(selector).filter(isVisible);
}

function querySelectorAllDeep<T extends HTMLElement>(selector: string, root: Document | ShadowRoot = document): T[] {
  const matches = Array.from(root.querySelectorAll<T>(selector));
  const shadowHosts = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((element) => element.shadowRoot);

  for (const host of shadowHosts) {
    if (host.shadowRoot) {
      matches.push(...querySelectorAllDeep<T>(selector, host.shadowRoot));
    }
  }

  return matches;
}

function querySelectorDeep<T extends Element>(selector: string, root: Document | ShadowRoot = document): T | undefined {
  const match = root.querySelector<T>(selector);
  if (match) {
    return match;
  }

  const shadowHosts = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((element) => element.shadowRoot);
  for (const host of shadowHosts) {
    if (!host.shadowRoot) {
      continue;
    }

    const shadowMatch = querySelectorDeep<T>(selector, host.shadowRoot);
    if (shadowMatch) {
      return shadowMatch;
    }
  }

  return undefined;
}

function findElementByLocator<T extends Element>(locator?: LocatorSpec): T | undefined {
  if (!locator) {
    return undefined;
  }

  const scope = locator.within ? findElementByLocator<HTMLElement>(locator.within) : undefined;
  const root = scope ?? document;
  const candidates = locatorCandidates(root, locator);
  const ranked = candidates
    .map((element) => ({ element, score: locatorScore(element, locator) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  if (ranked[0]) {
    return ranked[0].element as unknown as T;
  }

  for (const alternative of locator.alternatives ?? []) {
    const match = findElementByLocator<T>(alternative);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function locatorCandidates(root: Document | ShadowRoot | HTMLElement, locator: LocatorSpec): HTMLElement[] {
  const selectorParts = [
    locator.testId ? `[data-testid="${cssEscape(locator.testId)}"], [data-test="${cssEscape(locator.testId)}"], [data-test-id="${cssEscape(locator.testId)}"], [data-cy="${cssEscape(locator.testId)}"], [data-qa="${cssEscape(locator.testId)}"]` : "",
    locator.role ? `[role="${cssEscape(locator.role)}"]` : "",
    locator.placeholder ? `[placeholder="${cssEscape(locator.placeholder)}"]` : "",
    locator.name ? `[aria-label="${cssEscape(locator.name)}"]` : "",
    locator.label ? `[aria-label="${cssEscape(locator.label)}"]` : "",
    locator.tagName ?? "",
  ].filter(Boolean);

  const selector = selectorParts.length > 0 ? selectorParts.join(", ") : "*";
  const elementRoot = root instanceof HTMLElement ? root : undefined;
  const raw = elementRoot
    ? Array.from(elementRoot.querySelectorAll<HTMLElement>(selector))
    : querySelectorAllDeep<HTMLElement>(selector, root as Document | ShadowRoot);

  if (elementRoot && elementRoot.matches(selector)) {
    raw.unshift(elementRoot);
  }

  return Array.from(new Set(raw)).filter(isVisible);
}

function locatorScore(element: HTMLElement, locator: LocatorSpec): number {
  let score = 0;
  const accessibleName = accessibleNameFor(element).toLowerCase();
  const text = cleanText(element.textContent ?? "").toLowerCase();
  const placeholder = element.getAttribute("placeholder")?.toLowerCase();
  const role = element.getAttribute("role") ?? implicitRole(element);
  const testId = testIdFor(element);

  if (locator.testId && testId === locator.testId) score += 80;
  if (locator.css && queryReplayElement(locator.css) === element) score += 70;
  if (locator.role && role === locator.role) score += 30;
  if (locator.tagName && element.tagName.toLowerCase() === locator.tagName) score += 15;
  if (locator.type && inputType(element) === locator.type) score += 15;
  if (locator.placeholder && placeholder === locator.placeholder.toLowerCase()) score += 35;
  if (locator.name && accessibleName === locator.name.toLowerCase()) score += 50;
  if (locator.label && accessibleName === locator.label.toLowerCase()) score += 50;
  if (locator.text && text === locator.text.toLowerCase()) score += 35;
  if (locator.text && text.includes(locator.text.toLowerCase())) score += 15;

  return score;
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function isInputElement(element: HTMLElement): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement;
}

function isEditableElement(element: HTMLElement): boolean {
  return (
    isInputElement(element) ||
    element.isContentEditable ||
    ["textbox", "searchbox", "combobox", "spinbutton", "checkbox", "radio", "switch"].includes(element.getAttribute("role") ?? "")
  );
}

function isSensitiveInput(element: InputLikeElement): boolean {
  if (!(element instanceof HTMLInputElement)) {
    const metadata = [
      element.getAttribute("name"),
      element.id,
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("aria-labelledby"),
    ].join(" ").toLowerCase();
    return /token|secret|password|credential|api key|apikey/.test(metadata);
  }

  const type = element.type.toLowerCase();
  const name = `${element.name} ${element.id} ${element.placeholder} ${element.getAttribute("aria-label") ?? ""}`.toLowerCase();
  return type === "password" || type === "hidden" || /token|secret|password|credential|api key|apikey/.test(name);
}

function inputType(element: InputLikeElement): string {
  if (element instanceof HTMLInputElement) {
    return element.type || "text";
  }

  if (element instanceof HTMLSelectElement) {
    return "select";
  }

  if (element instanceof HTMLTextAreaElement) {
    return "textarea";
  }

  if (element.isContentEditable) {
    return "contenteditable";
  }

  return element.getAttribute("role") ?? element.tagName.toLowerCase();
}

function summarizeInputOptions(element: InputLikeElement): string[] | undefined {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options)
      .map((option) => cleanText(option.textContent ?? option.value))
      .filter(Boolean)
      .slice(0, 20);
  }

  if (element.getAttribute("role") !== "combobox") {
    return undefined;
  }

  const controls = element.getAttribute("aria-controls");
  const listbox = controls ? document.getElementById(controls) : undefined;
  const options = listbox
    ? Array.from(listbox.querySelectorAll("[role='option']"))
    : Array.from(document.querySelectorAll("[role='option']")).slice(0, 20);

  const labels = options
    .map((option) => cleanText(option.textContent ?? option.getAttribute("aria-label") ?? ""))
    .filter(Boolean)
    .slice(0, 20);

  return labels.length > 0 ? labels : undefined;
}

function previewInputValue(element: InputLikeElement): string {
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    return element.checked ? "checked" : "unchecked";
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const value = element.value;
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }

  if (["checkbox", "radio", "switch"].includes(element.getAttribute("role") ?? "")) {
    return element.getAttribute("aria-checked") === "true" ? "checked" : "unchecked";
  }

  const text = cleanText(element.textContent ?? element.getAttribute("aria-valuetext") ?? "");
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function findLabel(element: HTMLElement): string | undefined {
  const aria = element.getAttribute("aria-label");
  if (aria) {
    return cleanText(aria);
  }

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (cleanText(label)) {
      return cleanText(label);
    }
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

  return cleanText(element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "");
}

function previewText(element: HTMLElement): string {
  const text = cleanText(element.getAttribute("aria-label") || element.textContent || "");
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function bestSelector(element: HTMLElement): string {
  const id = element.getAttribute("id");
  if (id) {
    return `#${cssEscape(id)}`;
  }

  const testId =
    element.getAttribute("data-testid") ||
    element.getAttribute("data-test") ||
    element.getAttribute("data-test-id") ||
    element.getAttribute("data-cy") ||
    element.getAttribute("data-qa");
  if (testId) {
    return `[${testAttributeName(element)}="${cssEscape(testId)}"]`;
  }

  const name = element.getAttribute("name");
  if (name) {
    return `${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
  }

  const role = element.getAttribute("role");
  const aria = element.getAttribute("aria-label");
  if (role && aria) {
    return `[role="${cssEscape(role)}"][aria-label="${cssEscape(aria)}"]`;
  }

  if (aria) {
    return `${element.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`;
  }

  return cssPath(element);
}

function locatorForElement(element: HTMLElement): LocatorSpec {
  const selector = bestSelector(element);
  const name = accessibleNameFor(element);
  const testId = testIdFor(element);
  const role = element.getAttribute("role") ?? implicitRole(element);
  const text = visibleText(element);
  const locator: LocatorSpec = {
    css: selector,
    role,
    name: name || undefined,
    label: findLabel(element),
    placeholder: element.getAttribute("placeholder") ?? undefined,
    text: text || undefined,
    testId,
    tagName: element.tagName.toLowerCase(),
    type: inputType(element),
    confidence: selector.includes(":nth-of-type") ? 0.55 : 0.82,
  };

  const alternatives: Array<LocatorSpec | undefined> = [
    testId ? { testId, tagName: locator.tagName, confidence: 0.9 } : undefined,
    role && name ? { role, name, confidence: 0.85 } : undefined,
    locator.label ? { label: locator.label, tagName: locator.tagName, confidence: 0.78 } : undefined,
    locator.placeholder ? { placeholder: locator.placeholder, tagName: locator.tagName, confidence: 0.72 } : undefined,
    text ? { role, text, tagName: locator.tagName, confidence: 0.65 } : undefined,
  ];
  locator.alternatives = alternatives.filter((candidate): candidate is LocatorSpec => Boolean(candidate));

  return locator;
}

function testAttributeName(element: HTMLElement): string {
  return ["data-testid", "data-test", "data-test-id", "data-cy", "data-qa"].find((name) => element.hasAttribute(name)) ?? "data-testid";
}

function testIdFor(element: HTMLElement): string | undefined {
  const attributeName = testAttributeName(element);
  return element.getAttribute(attributeName) ?? undefined;
}

function accessibleNameFor(element: HTMLElement): string {
  return cleanText(findLabel(element) || element.getAttribute("aria-label") || element.getAttribute("title") || "");
}

function implicitRole(element: HTMLElement): string | undefined {
  const tag = element.tagName.toLowerCase();
  if (tag === "button" || (element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type))) {
    return "button";
  }

  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") return "checkbox";
    if (element.type === "radio") return "radio";
    if (element.type === "search") return "searchbox";
    return "textbox";
  }

  if (element instanceof HTMLTextAreaElement) return "textbox";
  if (element instanceof HTMLSelectElement) return "combobox";
  if (tag === "a" && element.hasAttribute("href")) return "link";
  if (tag === "table") return "table";
  if (tag === "nav") return "navigation";
  if (tag === "main") return "main";
  if (tag === "form") return "form";

  return undefined;
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
  regions: PageRegionSummary[] = [],
): string {
  const raw = JSON.stringify({
    path: window.location.pathname,
    inputs: inputs.map((input) => [input.selector, input.label, input.type]),
    buttons: buttons.map((button) => [button.selector, button.text]),
    tables: tables.map((table) => [table.selector, table.headers]),
    regions: regions.map((region) => [region.selector, region.role, region.label]),
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
