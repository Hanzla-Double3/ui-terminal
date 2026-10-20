import {
  forwardRef,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  RefObject,
  CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { getHost } from "../core/runtime.js";
import { TerminalError } from "../core/language.js";
import type { Control, Method, UIResult } from "../core/types.js";
import { ScopeContext, useTerminal } from "./context.js";
export type CliMetadata = {
  id: string;
  description?: string;
  label?: string;
  exposeValue?: boolean;
  sensitive?: boolean;
};
function assign<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}
function labelText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(labelText).join(" ");
  return "";
}
function shown(node: HTMLElement | null) {
  if (
    !node?.isConnected ||
    node.closest('[hidden],[inert],[aria-hidden="true"]')
  )
    return false;
  for (
    let ancestor: HTMLElement | null = node;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const style = getComputedStyle(ancestor);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    )
      return false;
  }
  return true;
}
function hit(node: HTMLElement | null) {
  if (!shown(node) || !node) return false;
  const rect = node.getBoundingClientRect();
  const left = Math.max(0, rect.left),
    right = Math.min(window.innerWidth, rect.right);
  const top = Math.max(0, rect.top),
    bottom = Math.min(window.innerHeight, rect.bottom);
  if (right <= left || bottom <= top) return false;
  const front = document.elementFromPoint(
    (left + right) / 2,
    (top + bottom) / 2,
  );
  return !!front && (front === node || node.contains(front));
}
type Registration = {
  ref: RefObject<HTMLElement | null>;
  cli?: CliMetadata;
  label: string;
  role: string;
  actions: Control["actions"];
  disabled?: boolean;
  secret?: boolean;
  value?: Control["value"];
  detail?: Control["detail"];
  path?: string[];
  layer?: string;
  active?: boolean;
};
/** Adapt a custom DOM widget without changing its normal handlers. */
export function useTerminalControl(options: Registration) {
  const { runtime } = useTerminal();
  const context = useContext(ScopeContext);
  const auto = useId().replace(/[^A-Za-z_0-9]/g, "");
  const make = (): Control => ({
    path: options.path ?? [
      ...context.path,
      options.cli?.id ?? `${options.role}_${auto}`,
    ],
    label: options.cli?.label ?? options.label,
    role: options.role,
    description: options.cli?.description,
    active:
      context.active && options.active !== false && shown(options.ref.current),
    layer: options.layer ?? context.layer,
    shared: context.shared,
    disabled: !!options.disabled,
    secret: options.secret || options.cli?.sensitive,
    exposeValue: options.cli?.exposeValue ?? options.role === "readout",
    value: options.value,
    detail: options.detail,
    actions: options.actions,
    measure: async () => {
      const rect = options.ref.current?.getBoundingClientRect();
      return rect
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : null;
    },
    actionable: () => hit(options.ref.current),
    reveal: async () => {
      options.ref.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      });
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(undefined)),
      );
    },
  });
  const latest = useRef(make);
  useLayoutEffect(() => {
    latest.current = make;
  });
  useLayoutEffect(
    () => getHost(runtime).register(() => latest.current()),
    [runtime],
  );
}
type ClickHandler = (event: React.MouseEvent<HTMLButtonElement>) => UIResult;
export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "onContextMenu"
> & {
  cli?: CliMetadata;
  onClick?: ClickHandler;
  onContextMenu?: ClickHandler;
  onHold?: () => UIResult;
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { cli, onClick, onContextMenu, onHold, children, ...props },
    forwarded,
  ) {
    const ref = useRef<HTMLButtonElement>(null);
    const capture = useRef<{
      value?: UIResult;
      error?: unknown;
      fired: boolean;
    } | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const held = useRef(false);
    useLayoutEffect(() => () => clearTimeout(timer.current), []);
    const invoke = (
      callback: ClickHandler | undefined,
      event: React.MouseEvent<HTMLButtonElement>,
    ) => {
      try {
        const value = callback?.(event);
        if (capture.current) {
          capture.current.value = value;
          capture.current.fired = true;
        }
      } catch (error) {
        if (capture.current) {
          capture.current.error = error;
          capture.current.fired = true;
        } else throw error;
      }
    };
    const activate = (kind: "click" | "contextmenu") => {
      const receipt = { fired: false } as NonNullable<typeof capture.current>;
      capture.current = receipt;
      try {
        if (kind === "click") ref.current!.click();
        else
          ref.current!.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              button: 2,
            }),
          );
      } finally {
        capture.current = null;
      }
      if (receipt.error) throw receipt.error;
      return receipt.value;
    };
    const actions: Control["actions"] = { click: () => activate("click") };
    if (onContextMenu) actions.right_click = () => activate("contextmenu");
    if (onHold) actions.hold = () => onHold();
    useTerminalControl({
      ref,
      cli,
      label: props["aria-label"] ?? (labelText(children) || "Button"),
      role: "button",
      disabled: props.disabled || props["aria-disabled"] === true,
      actions,
    });
    return (
      <button
        {...props}
        aria-label={props["aria-label"] ?? cli?.label}
        data-cli-id={cli?.id}
        data-cli-description={cli?.description}
        ref={(node) => {
          ref.current = node;
          assign(forwarded, node);
        }}
        onClick={(event) => {
          if (held.current) {
            held.current = false;
            event.preventDefault();
            return;
          }
          invoke(onClick, event);
        }}
        onContextMenu={
          onContextMenu
            ? (event) => {
                event.preventDefault();
                invoke(onContextMenu, event);
              }
            : undefined
        }
        onPointerDown={(event) => {
          props.onPointerDown?.(event);
          if (onHold) {
            held.current = false;
            timer.current = setTimeout(() => {
              held.current = true;
              void onHold();
            }, 600);
          }
        }}
        onPointerUp={(event) => {
          clearTimeout(timer.current);
          props.onPointerUp?.(event);
        }}
        onPointerCancel={(event) => {
          clearTimeout(timer.current);
          props.onPointerCancel?.(event);
        }}
        onPointerLeave={(event) => {
          clearTimeout(timer.current);
          props.onPointerLeave?.(event);
        }}
      >
        {children}
      </button>
    );
  },
);
export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  cli?: CliMetadata;
};
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { cli, ...props },
  forwarded,
) {
  const ref = useRef<HTMLInputElement>(null);
  const secret =
    props.type === "password" ||
    ["one-time-code", "current-password", "new-password"].includes(
      String(props.autoComplete),
    );
  const replace = (value: string) => {
    const node = ref.current!;
    if (props.maxLength !== undefined && value.length > props.maxLength)
      throw new TerminalError(
        "INVALID_ARGUMENT",
        `This field accepts at most ${props.maxLength} characters.`,
      );
    node.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const actions: Control["actions"] = {
    focus: () => {
      ref.current?.focus();
    },
    unfocus: () => {
      ref.current?.blur();
    },
  };
  if (!props.readOnly) {
    actions.type = (value) => replace(String(value));
    actions.clear = () => replace("");
    actions.press = () => {
      const node = ref.current!;
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      });
      node.dispatchEvent(event);
      if (!event.defaultPrevented && node.form) node.form.requestSubmit();
      node.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
        }),
      );
    };
  }
  useTerminalControl({
    ref,
    cli,
    label: props["aria-label"] ?? props.placeholder ?? "Field",
    role: "field",
    secret,
    disabled: props.disabled || props.readOnly,
    value: String(props.value ?? ref.current?.value ?? ""),
    actions,
  });
  return (
    <input
      {...props}
      data-cli-id={cli?.id}
      ref={(node) => {
        ref.current = node;
        assign(forwarded, node);
      }}
    />
  );
});
/** A visible informational widget. Inspection is its only terminal operation. */
export type ReadoutProps = HTMLAttributes<HTMLDivElement> & {
  cli?: CliMetadata;
  value?: Control["value"];
  detail?: Control["detail"];
};
export const Readout = forwardRef<HTMLDivElement, ReadoutProps>(function Readout(
  {cli, value, detail, children, ...props}, forwarded,
) {
  const ref = useRef<HTMLDivElement>(null);
  useTerminalControl({ref, cli: cli ? {...cli, exposeValue: cli.exposeValue ?? true} : undefined,
    label: props["aria-label"] ?? cli?.label ?? "Information", role: "readout", value, detail, actions: {}});
  return <div {...props} data-cli-id={cli?.id} data-cli-description={cli?.description}
    ref={node=>{ref.current=node;assign(forwarded,node);}}>{children ?? (value === undefined ? null : String(value))}</div>;
});

export function TerminalScope({
  id,
  kind = "group",
  active = true,
  children,
  className,
  style,
}: {
  id: string;
  kind?: "screen" | "group" | "list" | "item" | "navigation";
  active?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { runtime } = useTerminal();
  const parent = useContext(ScopeContext);
  const path = kind === "screen" ? parent.path : [...parent.path, id];
  useLayoutEffect(() => {
    if (kind === "screen" && active && parent.active)
      getHost(runtime).screen(id);
  }, [runtime, id, kind, active, parent.active]);
  return (
    <ScopeContext.Provider
      value={{
        ...parent,
        path,
        active: parent.active && active,
        shared: parent.shared || kind === "navigation",
      }}
    >
      <div className={className} style={style} hidden={!active}>
        {children}
      </div>
    </ScopeContext.Provider>
  );
}
export function Dialog({
  id,
  open,
  title,
  children,
}: {
  id: string;
  open: boolean;
  title: string;
  children: ReactNode;
}) {
  const { runtime, panelId, panelHeight } = useTerminal();
  const parent = useContext(ScopeContext);
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    getHost(runtime).layer(id, true);
    return () => getHost(runtime).layer(id, false);
  }, [runtime, id, open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = document.getElementById(panelId);
      const selector =
        'button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]';
      const controls = [
        ...(ref.current?.querySelectorAll<HTMLElement>(selector) ?? []),
        ...(panel?.querySelectorAll<HTMLElement>(selector) ?? []),
      ].filter((node) => node.getClientRects().length);
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if (
        index < 0 ||
        (!event.shiftKey && index === controls.length - 1) ||
        (event.shiftKey && index === 0)
      ) {
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [open, panelId]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <ScopeContext.Provider
      value={{ ...parent, path: ["dialog"], layer: id, active: true }}
    >
      <div
        className="uit-dialog-backdrop"
        style={{ inset: 0, paddingBottom: panelHeight }}
      >
        <section
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          aria-owns={panelId}
          className="uit-dialog"
        >
          <h2>{title}</h2>
          {children}
        </section>
      </div>
    </ScopeContext.Provider>,
    document.body,
  );
}
