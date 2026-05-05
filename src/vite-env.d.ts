/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_PROVIDER?: "local" | "minimax";
  readonly VITE_MINIMAX_PROXY_URL?: string;
  readonly VITE_MINIMAX_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const chrome: {
  runtime: {
    id?: string;
    onInstalled: {
      addListener(listener: () => void): void;
    };
    onMessage: {
      addListener(
        listener: (
          message: any,
          sender: any,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  };
  action: {
    onClicked: {
      addListener(listener: (tab: { windowId?: number }) => void): void;
    };
  };
  sidePanel: {
    setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
    open(options: { windowId: number }): Promise<void>;
  };
  tabs: {
    query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number; url?: string }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
  scripting: {
    executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown[]>;
  };
};
