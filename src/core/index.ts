import { TerminalError } from "./language.js";
import { TerminalRuntime } from "./runtime.js";
import type { ActionOutcome, RuntimeOptions, TerminalInput } from "./types.js";
export type {
  TerminalEvent,
  TerminalInput,
  TerminalOutput,
  TerminalState,
  HistoryEntry,
  Snapshot,
  ControlSummary,
  RuntimeOptions,
  Rect,
  ActionOutcome,
  Method,
  UIResult,
} from "./types.js";
export { TerminalError } from "./language.js";
export type { TerminalRuntime } from "./runtime.js";
export function createTerminal(options?: RuntimeOptions) {
  return new TerminalRuntime(options);
}
export function confirmed(receipt: Omit<ActionOutcome, "kind">): ActionOutcome {
  return { kind: "confirmed", ...receipt };
}
/** Local input adapter: the panel and tests both submit through this stream. */
export function createInput(): TerminalInput & {
  send(line: string): Promise<void>;
} {
  let listener: ((line: string) => Promise<void>) | undefined;
  return {
    subscribe(next) {
      if (listener)
        throw new TerminalError(
          "INPUT_ALREADY_ATTACHED",
          "This input stream is already attached.",
        );
      listener = next;
      return () => {
        if (listener === next) listener = undefined;
      };
    },
    async send(line) {
      if (!listener)
        throw new TerminalError(
          "DISABLED",
          "No terminal is attached to this input.",
        );
      await listener(line);
    },
  };
}
