import { formatPath, HELP, parse, TerminalError, under } from "./language.js";
import type { Command, Query } from "./language.js";
import type {
  ActionOutcome,
  Control,
  ControlSummary,
  HistoryEntry,
  RuntimeOptions,
  Snapshot,
  TerminalEvent,
  TerminalInput,
  TerminalOutput,
  TerminalState,
} from "./types.js";
type Entry = { id: symbol; get: () => Control };
type Baseline = { query: Query; snapshot: Snapshot };
type Attachment = {
  id: symbol;
  output: TerminalOutput;
  unsubscribe: () => void;
  baseline?: Baseline;
  alive: boolean;
};
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
// UTF-8 byte budget without browser TextEncoder (also works on native JS runtimes).
function utf8Length(value: string) {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
function safeText(value: string, limit = 400) {
  return value
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .slice(0, limit);
}
/** Registration-only host access; commands still enter through the input stream. */
const hosts = new WeakMap<
  TerminalRuntime,
  {
    register(get: () => Control): () => void;
    layer(id: string, open: boolean): void;
    screen(name: string): void;
    point(handler: RuntimeOptions["point"]): void;
  }
>();
export function getHost(runtime: TerminalRuntime) {
  return hosts.get(runtime)!;
}
export class TerminalRuntime {
  private entries = new Map<symbol, Entry>();
  private layers: string[] = [];
  private attachment?: Attachment;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private counter = 0;
  private sequence = 0;
  private revision = 0;
  private fingerprint = "";
  private currentScreen = "application";
  private outputQueue = Promise.resolve();
  private scope: string;
  private running = false;
  private state: TerminalState;
  private options: Required<Omit<RuntimeOptions, "point">> &
    Pick<RuntimeOptions, "point">;
  constructor(options: RuntimeOptions = {}) {
    this.options = {
      createSessionId: () => globalThis.crypto.randomUUID(),
      allowNumericIndices: false,
      enabled: false,
      scope: "local",
      maxControls: 200,
      maxHistory: 50,
      maxOutputBytes: 24000,
      actionTimeoutMs: 8000,
      ...options,
    };
    for (const [name, minimum, maximum] of [
      ["maxControls", 1, 10000],
      ["maxHistory", 1, 500],
      ["maxOutputBytes", 1024, 1000000],
      ["actionTimeoutMs", 10, 60000],
    ] as const) {
      const value = this.options[name];
      if (!Number.isInteger(value) || value < minimum || value > maximum)
        throw new TerminalError(
          "INVALID_ARGUMENT",
          `${name} must be an integer between ${minimum} and ${maximum}.`,
        );
    }
    this.scope = this.options.scope;
    this.state = {
      enabled: this.options.enabled,
      attached: false,
      busy: false,
      sessionId: this.options.createSessionId(),
      history: [],
      error: null,
    };
    hosts.set(this, {
      register: (get) => {
        const id = Symbol();
        this.entries.set(id, { id, get });
        return () => this.entries.delete(id);
      },
      layer: (id, open) => {
        const next = this.layers.filter((layer) => layer !== id);
        if (open) next.push(id);
        if (!equal(next, this.layers)) {
          this.layers = next;
          this.epoch++;
        }
      },
      screen: (name) => {
        if (this.currentScreen !== name) {
          this.currentScreen = name;
          this.epoch++;
        }
      },
      point: (handler) => {
        this.options.point = handler;
      },
    });
  }
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<TerminalState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  configure(config: { enabled?: boolean; scope?: string }) {
    const enabled = config.enabled ?? this.state.enabled;
    const scope = config.scope ?? this.scope;
    if (enabled === this.state.enabled && scope === this.scope) return;
    this.scope = scope;
    this.epoch++;
    this.fingerprint = "";
    this.revision++;
    if (this.attachment) this.attachment.baseline = undefined;
    this.update({
      enabled,
      sessionId: this.options.createSessionId(),
      history: [],
      error: null,
    });
  }
  attach({ input, output }: { input: TerminalInput; output: TerminalOutput }) {
    if (this.attachment?.alive)
      throw new TerminalError(
        "INPUT_ALREADY_ATTACHED",
        "This terminal already has an active input/output attachment.",
      );
    const attachment: Attachment = {
      id: Symbol(),
      output,
      unsubscribe: () => {},
      alive: true,
    };
    this.attachment = attachment;
    this.update({ attached: true, error: null });
    try {
      attachment.unsubscribe = input.subscribe((line) =>
        this.submit(line, attachment),
      );
    } catch (error) {
      this.attachment = undefined;
      this.update({ attached: false });
      throw error;
    }
    return {
      detach: () => {
        if (!attachment.alive) return;
        attachment.alive = false;
        attachment.unsubscribe();
        attachment.baseline = undefined;
        if (this.attachment === attachment) {
          this.epoch++;
          this.attachment = undefined;
          this.update({ attached: false, history: [] });
        }
      },
    };
  }
  private alive(attachment: Attachment, epoch?: number) {
    if (
      !attachment.alive ||
      this.attachment !== attachment ||
      (epoch !== undefined && epoch !== this.epoch)
    )
      throw new TerminalError(
        "SESSION_CHANGED",
        "The terminal session, screen or dialog changed. Inspect the UI again.",
      );
    if (!this.state.enabled)
      throw new TerminalError(
        "DISABLED",
        "Enable this terminal before submitting commands.",
      );
  }
  private async emit(
    attachment: Attachment,
    event: Omit<TerminalEvent, "schemaVersion" | "sessionId" | "sequence">,
  ) {
    if (!attachment.alive) return false;
    const full: TerminalEvent = {
      schemaVersion: "0.1",
      sessionId: this.state.sessionId,
      sequence: ++this.sequence,
      ...event,
    };
    const encoded = JSON.stringify(full);
    const safe =
      utf8Length(encoded) > this.options.maxOutputBytes
        ? {
            ...full,
            type: "output.truncated",
            message: "Output limit reached. Inspect a narrower group.",
            data: undefined,
          }
        : full;
    const write = this.outputQueue.then(async () => {
      if (attachment.alive && full.sessionId === this.state.sessionId)
        await attachment.output.write(safe);
    });
    this.outputQueue = write.catch(() => {});
    try {
      await write;
    } catch {
      attachment.alive = false;
      attachment.unsubscribe();
      if (this.attachment === attachment) {
        this.attachment = undefined;
        this.epoch++;
        this.update({
          attached: false,
          error:
            "OUTPUT_FAILED: Output could not be delivered. Reconnect the terminal; dispatched actions will not be retried.",
        });
      }
      throw new TerminalError("OUTPUT_FAILED", "The output stream failed.");
    }
    return safe === full;
  }
  private candidates(includeSecrets = false) {
    const layer = this.layers.at(-1) ?? "root";
    return [...this.entries.values()]
      .map((entry) => ({ ...entry, descriptor: entry.get() }))
      .filter(
        ({ descriptor: d }) =>
          d.active && d.layer === layer && (includeSecrets || !d.secret),
      );
  }
  private history(source: string, command?: Command): HistoryEntry {
    if (command?.kind === "action" && command.method === "type") {
      const target = this.candidates(true).find((entry) =>
        equal(entry.descriptor.path, command.path),
      );
      if (!target?.descriptor.exposeValue || target.descriptor.secret)
        return {
          text: `${formatPath(command.path)}.type("<redacted>")`,
          replayable: false,
        };
    }
    if (!command)
      return {
        text: safeText(
          source
            .replace(/\.type\([\s\S]*$/, ".type(<redacted>)")
            .replace(/"(?:[^"\\]|\\.)*"/g, '"<redacted>"'),
          4096,
        ),
        replayable: !source.includes('"') && !source.includes(".type("),
      };
    return { text: safeText(source, 4096), replayable: true };
  }
  private summary(control: Control): ControlSummary {
    return {
      path: formatPath(control.path),
      role: safeText(control.role, 40),
      label: safeText(control.label),
      ...(control.description
        ? { description: safeText(control.description) }
        : {}),
      ...(control.detail
        ? {
            detail: Object.fromEntries(
              Object.entries(control.detail)
                .slice(0, 32)
                .map(([key, value]) => [
                  safeText(key, 80),
                  typeof value === "string" ? safeText(value, 500) : value,
                ]),
            ),
          }
        : {}),
      actions: Object.keys(control.actions).sort(),
      disabled: control.disabled,
      shared: control.shared,
      ...(control.exposeValue && control.value !== undefined
        ? {
            value:
              typeof control.value === "string"
                ? safeText(control.value, 500)
                : control.value,
          }
        : {}),
    };
  }
  private async snapshot(query: Query): Promise<Snapshot> {
    let rows = this.candidates();
    const all = rows
      .map((row) => this.summary(row.descriptor))
      .sort((a, b) => a.path.localeCompare(b.path));
    const signature = JSON.stringify([this.currentScreen, this.layers, all]);
    if (signature !== this.fingerprint) {
      this.fingerprint = signature;
      this.revision++;
    }
    const omittedNavigation =
      query.mode === "screen"
        ? rows.filter((row) => row.descriptor.shared).length
        : 0;
    rows = rows.filter(
      ({ descriptor: d }) =>
        (!query.path || under(d.path, query.path)) &&
        (query.mode !== "screen" || !d.shared) &&
        (query.mode !== "navigation" || d.shared),
    );
    if (query.mode === "visible") {
      const visible = await Promise.all(
        rows.map(async (row) => ({
          row,
          visible: await row.descriptor.actionable(),
        })),
      );
      rows = visible.filter((item) => item.visible).map((item) => item.row);
    }
    if (query.path && !rows.length)
      throw new TerminalError(
        "NOT_FOUND",
        "No current control in that group. Run ls.",
      );
    const controls = rows
      .map((row) => this.summary(row.descriptor))
      .sort((a, b) => a.path.localeCompare(b.path));
    return {
      revision: this.revision,
      screen: this.currentScreen,
      dialog: this.layers.length > 0,
      controls: controls.slice(0, this.options.maxControls),
      truncated: controls.length > this.options.maxControls,
      omittedNavigation,
    };
  }
  private async perform(
    command: Extract<Command, { kind: "action" }>,
    attachment: Attachment,
    epoch: number,
    commandId: string,
  ) {
    const session = this.state.sessionId;
    const matches = this.candidates().filter((row) =>
      equal(row.descriptor.path, command.path),
    );
    if (!matches.length)
      throw new TerminalError(
        "NOT_FOUND",
        "That control is unavailable. Inspect the current screen/dialog.",
      );
    if (matches.length !== 1)
      throw new TerminalError(
        "AMBIGUOUS_TARGET",
        "Duplicate control identity. The host must provide unique IDs.",
      );
    const target = matches[0]!;
    const originalLabel = target.descriptor.label;
    const method = command.method === "long_press" ? "hold" : command.method;
    const validate = (d: Control) => {
      if (d.disabled)
        throw new TerminalError(
          "DISABLED_CONTROL",
          "This control is disabled in the UI.",
        );
      if (!d.actions[method])
        throw new TerminalError(
          "UNKNOWN_ACTION",
          "This control does not support that action.",
        );
    };
    validate(target.descriptor);
    await target.descriptor.reveal?.();
    this.alive(attachment, epoch);
    const rect = await target.descriptor.measure();
    if (
      !rect ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      !(await target.descriptor.actionable())
    )
      throw new TerminalError(
        "NOT_ACTIONABLE",
        "The control is hidden, obscured or outside the visible app.",
      );
    await this.emit(attachment, {
      type: "action.started",
      commandId,
      data: { path: formatPath(command.path) },
    });
    this.alive(attachment, epoch);
    await this.options.point?.(rect);
    this.alive(attachment, epoch);
    const fresh = this.candidates().filter((row) =>
      equal(row.descriptor.path, command.path),
    );
    if (
      fresh.length !== 1 ||
      fresh[0]!.id !== target.id ||
      fresh[0]!.descriptor.label !== originalLabel
    )
      throw new TerminalError(
        "STALE_TARGET",
        "The target changed while the cursor moved. Inspect again.",
      );
    validate(fresh[0]!.descriptor);
    if (!(await fresh[0]!.descriptor.actionable()))
      throw new TerminalError(
        "NOT_ACTIONABLE",
        "The control became obscured before activation.",
      );
    this.alive(attachment, epoch);
    // Native geometry checks may await a frame: re-resolve after that boundary.
    const final = this.candidates().filter((row) =>
      equal(row.descriptor.path, command.path),
    );
    if (
      final.length !== 1 ||
      final[0]!.id !== target.id ||
      final[0]!.descriptor.label !== originalLabel
    )
      throw new TerminalError(
        "STALE_TARGET",
        "The target changed before activation. Inspect again.",
      );
    validate(final[0]!.descriptor);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const result = final[0]!.descriptor.actions[method]!(...command.args);
    let outcome: void | ActionOutcome;
    try {
      outcome = await Promise.race([
        Promise.resolve(result),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new TerminalError(
                  "TIMEOUT_OUTCOME_UNKNOWN",
                  "The UI action was dispatched but its outcome is unknown. Check the app before retrying.",
                ),
              ),
            this.options.actionTimeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    this.alive(attachment);
    if (this.state.sessionId !== session)
      throw new TerminalError(
        "SESSION_CHANGED",
        "The host session changed while that operation was running. Check the host for its result.",
      );
    if (outcome?.kind === "confirmed")
      await this.emit(attachment, {
        type: "action.completed",
        commandId,
        message: safeText(outcome.message),
        data: {
          kind: "host-confirmed",
          persistence: outcome.persistence,
          sync: outcome.sync,
        },
      });
    else
      await this.emit(attachment, {
        type: "action.dispatched",
        commandId,
        message: `Dispatched ${method}. Check the UI for the result.`,
        data: { kind: "outcome-unknown" },
      });
  }
  private async submit(source: string, attachment: Attachment) {
    if (!attachment.alive || this.attachment !== attachment) return;
    const commandId = `command-${++this.counter}`;
    let command: Command | undefined, parseError: unknown;
    try {
      command = parse(source, this.options);
    } catch (error) {
      parseError = error;
    }
    const history = this.history(source, command);
    this.update({
      history: [...this.state.history, history].slice(-this.options.maxHistory),
    });
    let ownsRun = false;
    const session = this.state.sessionId;
    try {
      await this.emit(attachment, {
        type: "command.submitted",
        commandId,
        message: history.text,
      });
      this.alive(attachment);
      if (session !== this.state.sessionId)
        throw new TerminalError(
          "SESSION_CHANGED",
          "The host session changed before this command was processed.",
        );
      if (this.running)
        throw new TerminalError(
          "BUSY",
          "Wait for the current command to finish. This command was not queued.",
        );
      ownsRun = true;
      this.running = true;
      this.update({ busy: true });
      const epoch = this.epoch;
      if (parseError) throw parseError;
      if (!command) throw new TerminalError("PARSE_ERROR", "Invalid command.");
      if (command.kind === "help")
        await this.emit(attachment, { type: "help", commandId, message: HELP });
      else if (command.kind === "clear")
        await this.emit(attachment, { type: "transcript.clear", commandId });
      else if (command.kind === "inspect") {
        const snapshot = await this.snapshot(command.query);
        this.alive(attachment, epoch);
        const delivered = await this.emit(attachment, {
          type: "discovery.snapshot",
          commandId,
          data: snapshot,
        });
        this.alive(attachment, epoch);
        attachment.baseline =
          !delivered || snapshot.truncated
            ? undefined
            : { query: command.query, snapshot };
      } else if (command.kind === "changes") {
        const baseline = attachment.baseline;
        if (!baseline)
          throw new TerminalError(
            "BASELINE_REQUIRED",
            "Run ls or inspect a smaller group before requesting changes.",
          );
        const next = await this.snapshot(baseline.query);
        this.alive(attachment, epoch);
        if (next.truncated || next.revision - baseline.snapshot.revision > 100)
          throw new TerminalError(
            "BASELINE_REQUIRED",
            "The baseline is incomplete or expired. Inspect a narrower group.",
          );
        const before = new Map(
          baseline.snapshot.controls.map((row) => [row.path, row]),
        );
        const after = new Map(next.controls.map((row) => [row.path, row]));
        const data = {
          fromRevision: baseline.snapshot.revision,
          toRevision: next.revision,
          screen: next.screen,
          dialog: next.dialog,
          added: next.controls.filter((row) => !before.has(row.path)),
          changed: next.controls.filter(
            (row) => before.has(row.path) && !equal(before.get(row.path), row),
          ),
          removed: baseline.snapshot.controls
            .filter((row) => !after.has(row.path))
            .map((row) => ({
              path: row.path,
              reason: "unavailable-or-unmounted",
            })),
        };
        const delivered = await this.emit(attachment, {
          type: "discovery.delta",
          commandId,
          data,
        });
        this.alive(attachment, epoch);
        attachment.baseline = delivered
          ? { query: baseline.query, snapshot: next }
          : undefined;
      } else await this.perform(command, attachment, epoch, commandId);
      if (this.state.sessionId === session)
        await this.emit(attachment, {
          type: "command.finished",
          commandId,
          data: {
            status: "processed",
            screen: this.currentScreen,
            revision: this.revision,
          },
        });
    } catch (error) {
      if (attachment.alive && this.state.sessionId === session) {
        const known = error instanceof TerminalError;
        try {
          await this.emit(attachment, {
            type: "command.rejected",
            commandId,
            code: known ? error.code : "ACTION_FAILED",
            message: known
              ? error.message
              : "The host UI action failed. Check the application for details.",
          });
        } catch {
          /* The failed output attachment has already been revoked. */
        }
      }
    } finally {
      if (ownsRun) {
        this.running = false;
        this.update({ busy: false });
      }
    }
  }
  dispose() {
    this.attachment?.unsubscribe();
    if (this.attachment) this.attachment.alive = false;
    this.attachment = undefined;
    this.epoch++;
    this.entries.clear();
    this.layers = [];
    this.update({ enabled: false, attached: false, history: [], error: null });
    this.listeners.clear();
  }
}
