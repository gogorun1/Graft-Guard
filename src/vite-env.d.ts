/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_PROVIDER?: "local" | "minimax";
  readonly VITE_MINIMAX_PROXY_URL?: string;
  readonly VITE_MINIMAX_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
