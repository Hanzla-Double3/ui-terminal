import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { createInput, createTerminal } from "../core/index.js";
import { getHost } from "../core/runtime.js";
import type { TerminalRuntime } from "../core/runtime.js";
import type { Rect, TerminalEvent } from "../core/types.js";
type ContextValue = {
  runtime: TerminalRuntime;
  input: ReturnType<typeof createInput>;
  events: readonly TerminalEvent[];
  pointer: Rect | null;
  panelId: string;
  panelHeight: number;
  setPanelHeight: (height: number) => void;
};
const Context = createContext<ContextValue | null>(null);
export const ScopeContext = createContext({
  path: [] as string[],
  active: true,
  layer: "root",
  shared: false,
});
export function useTerminal() {
  const context = useContext(Context);
  if (!context)
    throw new Error("Terminal controls must be inside TerminalProvider.");
  const state = useSyncExternalStore(
    context.runtime.subscribe,
    context.runtime.getState,
    context.runtime.getState,
  );
  return { ...context, state };
}
export function TerminalProvider({
  children,
  enabled = false,
  scope = "local",
  runtime: supplied,
}: {
  children: ReactNode;
  enabled?: boolean;
  scope?: string;
  runtime?: TerminalRuntime;
}) {
  const [runtime] = useState(() => supplied ?? createTerminal());
  const input = useMemo(() => createInput(), []);
  const [events, setEvents] = useState<readonly TerminalEvent[]>([]);
  const [pointer, setPointer] = useState<Rect | null>(null);
  const panelId = useId();
  const [panelHeight, setPanelHeight] = useState(0);
  const state = useSyncExternalStore(
    runtime.subscribe,
    runtime.getState,
    runtime.getState,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    runtime.configure({ enabled, scope });
  }, [runtime, enabled, scope]);
  useEffect(() => {
    const connection = runtime.attach({
      input,
      output: {
        write(event) {
          setEvents((previous) =>
            event.type === "transcript.clear"
              ? []
              : [...previous, event].slice(-140),
          );
        },
      },
    });
    return () => connection.detach();
  }, [runtime, input]);
  useEffect(() => {
    getHost(runtime).point(async (rect) => {
      clearTimeout(timer.current);
      setPointer(rect);
      const reduced =
        typeof matchMedia !== "undefined" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      await new Promise((resolve) => setTimeout(resolve, reduced ? 0 : 200));
      timer.current = setTimeout(() => setPointer(null), 650);
    });
    return () => {
      getHost(runtime).point(undefined);
      clearTimeout(timer.current);
    };
  }, [runtime]);
  useEffect(() => {
    setEvents([]);
    setPointer(null);
  }, [state.sessionId]);
  return (
    <Context.Provider
      value={{
        runtime,
        input,
        events,
        pointer,
        panelId,
        panelHeight,
        setPanelHeight,
      }}
    >
      {children}
    </Context.Provider>
  );
}
