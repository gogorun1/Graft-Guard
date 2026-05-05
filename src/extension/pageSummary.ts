import type { ToolSchema } from "../graft/schemaTypes";

export type PageInputSummary = {
  selector: string;
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
  text: string;
  type?: string;
  role?: string;
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

export type PageRegionSummary = {
  selector: string;
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
      label?: string;
      inputType: string;
      valuePreview: string;
    }
  | {
      type: "click";
      selector: string;
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
