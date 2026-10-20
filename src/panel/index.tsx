import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTerminal } from "../react/context.js";
import type { ControlSummary, Snapshot, TerminalEvent } from "../core/types.js";
import { completePrefix } from "./completion.js";
function EventView({ event }: { event: TerminalEvent }) {
  if (event.type === "command.finished" || event.type === "action.started")
    return null;
  if (event.type === "discovery.snapshot") {
    const snapshot = event.data as Snapshot;
    return (
      <div className="uit-snapshot">
        <div className="uit-output-meta">
          {snapshot.screen}
          {snapshot.dialog ? " / active dialog" : ""}{" "}
          <span>
            revision {snapshot.revision} · {snapshot.controls.length} controls
          </span>
        </div>
        {snapshot.controls.length === 0 && (
          <div className="uit-muted">No controls in this view.</div>
        )}
        {snapshot.controls.map((control, index) => (
          <div className="uit-control" key={`${control.path}-${index}`}>
            <span className="uit-control-path">{control.path}</span>
            <span className="uit-control-label">
              {control.label}
              {control.disabled ? " [disabled]" : ""}
            </span>
            <span className="uit-control-actions">
              {control.actions.join(" · ")}
            </span>
            {control.description && (
              <span className="uit-control-description">
                {control.description}
              </span>
            )}
          </div>
        ))}
        {snapshot.omittedNavigation > 0 && (
          <div className="uit-muted">
            {snapshot.omittedNavigation} shared navigation controls · use ls
            navigation
          </div>
        )}
        {snapshot.truncated && (
          <div className="uit-warning">
            Listing truncated. Inspect a narrower group.
          </div>
        )}
      </div>
    );
  }
  if (event.type === "discovery.delta") {
    const delta = event.data as {
      fromRevision: number;
      toRevision: number;
      added: ControlSummary[];
      changed: ControlSummary[];
      removed: { path: string }[];
    };
    return (
      <div>
        <div className="uit-output-meta">
          Changes · revision {delta.fromRevision} → {delta.toRevision}
        </div>
        {[
          ...delta.added.map((row) => `+ ${row.path} · ${row.label}`),
          ...delta.changed.map((row) => `~ ${row.path} · ${row.label}`),
          ...delta.removed.map((row) => `− ${row.path}`),
        ].map((line) => (
          <div key={line} className="uit-delta">
            {line}
          </div>
        ))}
        {!delta.added.length &&
          !delta.changed.length &&
          !delta.removed.length && (
            <div className="uit-muted">No changes in this scope.</div>
          )}
      </div>
    );
  }
  return (
    <div
      className={
        event.type === "command.submitted"
          ? "uit-command"
          : event.code
            ? "uit-error"
            : event.type === "action.completed"
              ? "uit-success"
              : "uit-message"
      }
    >
      {event.type === "command.submitted" ? (
        <span className="uit-prompt">❯ </span>
      ) : null}
      {event.code ? `${event.code} · ` : ""}
      {event.message}
      {event.type === "action.completed" && event.data ? (
        <span className="uit-receipt"> {JSON.stringify(event.data)}</span>
      ) : null}
    </div>
  );
}
export type TerminalPanelProps = {
  defaultHeight?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
};
export function TerminalPanel({
  defaultHeight = 200,
  title = "Terminal",
  className = "",
  style,
}: TerminalPanelProps) {
  const { state, input, events, pointer, panelId, setPanelHeight } =
    useTerminal();
  const [command, setCommand] = useState("");
  const [requestedHeight, setHeight] = useState(defaultHeight);
  const [open, setOpen] = useState(true);
  const [hint, setHint] = useState("");
  const [recall, setRecall] = useState(-1);
  const [viewport, setViewport] = useState(
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const draft = useRef("");
  const height = open
    ? Math.max(110, Math.min(requestedHeight, viewport * 0.65))
    : 38;
  useEffect(() => {
    setPanelHeight(state.enabled ? height : 0);
  }, [height, state.enabled, setPanelHeight]);
  useEffect(() => {
    const resize = () => setViewport(window.innerHeight);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    const node = outputRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [events, height]);
  useEffect(() => {
    setCommand("");
    setRecall(-1);
    setHint("");
  }, [state.sessionId]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "Backquote") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  const submit = async () => {
    if (!command.trim()) return;
    const line = command;
    setCommand("");
    setRecall(-1);
    setHint("");
    try {
      await input.send(line);
    } catch {
      setHint(
        "No input/output attachment is active. Re-enable or reconnect this terminal.",
      );
    }
    if (!/\.(?:focus|unfocus)\(\)\s*$/.test(line)) inputRef.current?.focus();
  };
  const completion = () => {
    const snapshots = events
      .filter((event) => event.type === "discovery.snapshot")
      .flatMap((event) => (event.data as Snapshot).controls);
    const commands = [
      "help",
      "ls",
      "ls cart",
      "ls navigation",
      "ls --all",
      "ls --visible",
      "ls --changes",
      "clear",
    ];
    for (const control of snapshots) {
      commands.push(control.path, `ls ${control.path}`);
      for (const action of control.actions)
        commands.push(
          `${control.path}.${action}(${action === "type" ? '""' : action === "press" ? '"Enter"' : action === "scroll" ? "250" : ""})`,
        );
    }
    const result = completePrefix(command, commands);
    if (result.value !== command) {
      setCommand(result.value);
      setHint("");
    } else if (result.total)
      setHint(
        result.options.join("    ") +
          (result.total > result.options.length
            ? `    … ${result.total} options`
            : ""),
      );
    else setHint("Run ls to discover current controls first.");
  };
  const remember = (direction: number) => {
    if (recall === -1 && direction > 0) draft.current = command;
    const next = Math.max(
      -1,
      Math.min(state.history.length - 1, recall + direction),
    );
    setRecall(next);
    if (next === -1) {
      setCommand(draft.current);
      setHint("");
      return;
    }
    const entry = state.history[state.history.length - 1 - next]!;
    setCommand(entry.replayable ? entry.text : "");
    setHint(
      entry.replayable ? "" : `${entry.text} · Value redacted; enter it again.`,
    );
  };
  if (!state.enabled) return null;
  return (
    <>
      <div style={{ height, flexShrink: 0 }} aria-hidden="true" />
      <section
        id={panelId}
        className={`uit-panel ${className}`}
        style={{ height, ...style }}
        aria-label="UI terminal"
        data-last-command={events.at(-1)?.commandId ?? ""}
        data-last-event={events.at(-1)?.type ?? ""}
      >
        {open && (
          <div
            className="uit-resize"
            role="separator"
            aria-label="Resize terminal"
            aria-orientation="horizontal"
            tabIndex={0}
            aria-valuemin={110}
            aria-valuemax={Math.round(viewport * 0.65)}
            aria-valuenow={Math.round(height)}
            onKeyDown={(event) => {
              if (["ArrowUp", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                setHeight(height + (event.key === "ArrowUp" ? 25 : -25));
              }
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              event.currentTarget.dataset.start = `${event.clientY},${height}`;
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              const [start, initial] = event.currentTarget.dataset
                .start!.split(",")
                .map(Number);
              setHeight(
                Math.max(
                  110,
                  Math.min(initial! + start! - event.clientY, viewport * 0.65),
                ),
              );
            }}
          >
            <i />
          </div>
        )}
        <header className="uit-header">
          <span className="uit-tab">
            ⌘ <strong>{title}</strong>
            <small>PREVIEW</small>
          </span>
          <span className="uit-stream">
            <i className={state.busy ? "working" : ""} />
            {state.busy ? "working" : "local"} <span>1 input / 1 output</span>
          </span>
          <div className="uit-tools">
            <button
              title="Reset terminal height"
              aria-label="Reset terminal height"
              onClick={() => setHeight(defaultHeight)}
            >
              ↕
            </button>
            <button
              title="Clear output"
              aria-label="Clear terminal output"
              onClick={() => void input.send("clear")}
            >
              ⌫
            </button>
            <button
              title={open ? "Minimize" : "Expand"}
              aria-label={open ? "Minimize terminal" : "Expand terminal"}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "−" : "⌃"}
            </button>
          </div>
        </header>
        {open && (
          <>
            <div
              className="uit-output"
              ref={outputRef}
              role="log"
              aria-label="Terminal output"
              aria-live="polite"
              aria-relevant="additions"
            >
              {events.length === 0 && (
                <div className="uit-welcome">
                  <span>UI TERMINAL / LOCAL PREVIEW</span>
                  <p>
                    Your interface, one command away. Type <b>ls</b> to look
                    around.
                  </p>
                </div>
              )}
              {events.map((event) => (
                <EventView
                  event={event}
                  key={`${event.sessionId}-${event.sequence}`}
                />
              ))}
            </div>
            {state.error && (
              <div className="uit-error uit-hint">{state.error}</div>
            )}
            {hint && (
              <div className="uit-hint" role="status">
                {hint}
              </div>
            )}
            <form
              className="uit-input-row"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <span className="uit-prompt">❯</span>
              <input
                ref={inputRef}
                aria-label="Terminal command"
                value={command}
                maxLength={4096}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                disabled={!state.attached}
                placeholder="Type a command…"
                onChange={(event) => {
                  setCommand(event.target.value);
                  setRecall(-1);
                  setHint("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    remember(event.key === "ArrowUp" ? 1 : -1);
                  }
                  if (event.key === "Tab") {
                    event.preventDefault();
                    completion();
                  }
                }}
              />
              <button
                type="submit"
                aria-label="Run command"
                disabled={!state.attached}
              >
                ↵
              </button>
              <span className="uit-key-hint">TAB complete</span>
            </form>
          </>
        )}
      </section>
      {pointer && (
        <div
          className="uit-pointer"
          aria-hidden="true"
          style={{
            left: pointer.x - 3,
            top: pointer.y - 3,
            width: pointer.width + 6,
            height: pointer.height + 6,
          }}
        >
          <span>↖</span>
        </div>
      )}
    </>
  );
}
