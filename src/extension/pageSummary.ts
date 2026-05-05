export type PageInputSummary = {
  selector: string;
  label?: string;
  type: string;
  name?: string;
  placeholder?: string;
  required: boolean;
};

export type PageButtonSummary = {
  selector: string;
  text: string;
  type?: string;
};

export type PageTableSummary = {
  selector: string;
  headers: string[];
  rowCount: number;
};

export type PageFormSummary = {
  selector: string;
  inputCount: number;
  buttonCount: number;
};

export type PageDomSummary = {
  title: string;
  url: string;
  origin: string;
  fingerprint: string;
  forms: PageFormSummary[];
  inputs: PageInputSummary[];
  buttons: PageButtonSummary[];
  tables: PageTableSummary[];
};

export type CollectPageSummaryMessage = {
  type: "GRAFT_GUARD_COLLECT_PAGE";
};

export type ExtensionMessage = CollectPageSummaryMessage;
