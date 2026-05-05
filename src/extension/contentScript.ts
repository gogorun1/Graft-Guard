import type {
  ExtensionMessage,
  PageButtonSummary,
  PageDomSummary,
  PageFormSummary,
  PageInputSummary,
  PageTableSummary,
} from "./pageSummary";

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type !== "GRAFT_GUARD_COLLECT_PAGE") {
    return false;
  }

  sendResponse({ ok: true, summary: collectPageSummary() });
  return true;
});

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
  return Array.from(document.querySelectorAll<T>(selector)).filter((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  });
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
