export type Rect = { x: number; y: number; width: number; height: number };
export type Method =
  | "click"
  | "right_click"
  | "hold"
  | "long_press"
  | "type"
  | "clear"
  | "focus"
  | "unfocus"
  | "press"
  | "scroll";
export type ActionOutcome = {
  kind: "confirmed";
  message: string;
  persistence: "memory" | "local" | "server";
  sync?: "pending" | "acknowledged";
};
export type UIResult = void | ActionOutcome | Promise<void | ActionOutcome>;
export type TerminalEvent = {
  schemaVersion: "0.1";
  sessionId: string;
  sequence: number;
  commandId?: string;
  type: string;
  message?: string;
  code?: string;
  data?: unknown;
};
export type TerminalInput = {
  subscribe(listener: (line: string) => Promise<void>): () => void;
};
export type TerminalOutput = {
  write(event: TerminalEvent): void | Promise<void>;
};
export type HistoryEntry = { text: string; replayable: boolean };
export type TerminalState = {
  enabled: boolean;
  attached: boolean;
  busy: boolean;
  sessionId: string;
  history: readonly HistoryEntry[];
  error: string | null;
};
export type ControlSummary = {
  path: string;
  role: string;
  label: string;
  description?: string;
  actions: string[];
  disabled: boolean;
  shared: boolean;
  value?: string | number | boolean;
};
export type Snapshot = {
  revision: number;
  screen: string;
  dialog: boolean;
  controls: ControlSummary[];
  truncated: boolean;
  omittedNavigation: number;
};
/** Internal adapter contract. Not a second public command-execution interface. */
export type Control = {
  path: string[];
  role: string;
  label: string;
  description?: string;
  active: boolean;
  layer: string;
  shared: boolean;
  disabled: boolean;
  secret?: boolean;
  value?: string | number | boolean;
  exposeValue?: boolean;
  actions: Partial<Record<Method, (...args: (string | number)[]) => UIResult>>;
  measure(): Promise<Rect | null>;
  actionable(): boolean;
  reveal?(): Promise<void>;
};
export type RuntimeOptions = {
  enabled?: boolean;
  scope?: string;
  maxControls?: number;
  maxHistory?: number;
  maxOutputBytes?: number;
  actionTimeoutMs?: number;
  point?: (rect: Rect) => Promise<void>;
};
