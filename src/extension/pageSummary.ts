import type { LocatorSpec, ToolSchema } from "../graft/schemaTypes";

export type PageInputSummary = {
  selector: string;
  locator?: LocatorSpec;
  label?: string;
  type: string;
  role?: string;
  name?: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
};

export type PageButtonSummary = {
  selector: string;
  locator?: LocatorSpec;
  text: string;
  type?: string;
  role?: string;
};

export type PageTableSummary = {
  selector: string;
  locator?: LocatorSpec;
  headers: string[];
  rowCount: number;
};

export type PageFormSummary = {
  selector: string;
  locator?: LocatorSpec;
  inputCount: number;
  buttonCount: number;
};

export type PageRegionSummary = {
  selector: string;
  locator?: LocatorSpec;
  role?: string;
  label?: string;
  textPreview: string;
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
  regions: PageRegionSummary[];
};

export type CapturedStep =
  | {
      type: "setValue";
      selector: string;
      locator?: LocatorSpec;
      label?: string;
      inputType: string;
      valuePreview: string;
    }
  | {
      type: "click";
      selector: string;
      locator?: LocatorSpec;
      label?: string;
      tagName: string;
    };

export type CollectPageSummaryMessage = {
  type: "GRAFT_GUARD_COLLECT_PAGE";
};

export type StartCaptureMessage = {
  type: "GRAFT_GUARD_START_CAPTURE";
};

export type StopCaptureMessage = {
  type: "GRAFT_GUARD_STOP_CAPTURE";
};

export type ReplayToolMessage = {
  type: "GRAFT_GUARD_REPLAY_TOOL";
  schema: ToolSchema;
  params: Record<string, unknown>;
};

export type StartCaptureSessionMessage = {
  type: "GRAFT_GUARD_START_CAPTURE_SESSION";
  tabId: number;
};

export type StopCaptureSessionMessage = {
  type: "GRAFT_GUARD_STOP_CAPTURE_SESSION";
  tabId: number;
};

export type CaptureStatusMessage = {
  type: "GRAFT_GUARD_CAPTURE_STATUS";
};

export type CaptureStepMessage = {
  type: "GRAFT_GUARD_CAPTURE_STEP";
  step: CapturedStep;
};

export type ExtensionMessage =
  | CollectPageSummaryMessage
  | StartCaptureMessage
  | StopCaptureMessage
  | ReplayToolMessage;

export type BackgroundMessage =
  | StartCaptureSessionMessage
  | StopCaptureSessionMessage
  | CaptureStatusMessage
  | CaptureStepMessage;
