# React integration

The examples use the temporary local package name. It is not available on npm.
For local consumers, build this checkout, run `npm pack`, and install the resulting
tarball. Keep React/React DOM in the consuming application's own dependencies.

```sh
npm ci
npm run build:lib
npm pack
```

Install the tarball by its actual path in the consuming project. `npm run
test:package` exercises that arrangement automatically without a FayPOS checkout.

## Provider and panel

```tsx
import {
  TerminalProvider,
  TerminalScope,
  Button,
} from "ui-terminal-local/react";
import { TerminalPanel } from "ui-terminal-local/panel";
import "ui-terminal-local/panel.css";

<TerminalProvider enabled={userEnabledTerminal} scope={currentSessionIdentity}>
  <TerminalScope id="editor" kind="screen" active={editorIsFocused}>
    <Button
      cli={{ id: "save", description: "Save the current document" }}
      onClick={save}
    >
      Save document
    </Button>
  </TerminalScope>
  <TerminalPanel title="Commands" defaultHeight={200} />
</TerminalProvider>;
```

`enabled` defaults to false. The host owns persistence of that preference. `scope`
is an opaque identity that must change when the authorized user/workspace changes.
Do not put credentials or private record contents in it. A supplied `runtime` is
selected at provider mount; use a new provider root when replacing the runtime.

The panel supports `title`, `defaultHeight`, `className` and `style`. Its CSS uses
`--uit-bg`, `--uit-text`, `--uit-muted` and `--uit-accent` for theming. Keep imported
panel CSS; geometry and visibility depend on the control actually being on screen.

## Metadata

| `cli` property | Meaning                                                                             |
| -------------- | ----------------------------------------------------------------------------------- |
| `id`           | Stable local key within the nearest semantic scope                                  |
| `label`        | Concise name used in discovery; supplied buttons also use it as an accessible label |
| `description`  | Human/agent-readable explanation; plain text only                                   |
| `exposeValue`  | Explicitly allow a public value into discovery and replayable text history          |
| `sensitive`    | Exclude a secret control even when its HTML type does not identify it as secret     |

`cli` is optional. Missing IDs receive generated local mount identities; explicit
stable keys are preferable for repeatable commands. Labels and descriptions can
change or be localized without changing an explicitly supplied ID.

## Fields

```tsx
import { Field } from "ui-terminal-local/react";

<Field
  cli={{ id: "search", description: "Search the catalogue", exposeValue: true }}
  aria-label="Search catalogue"
  value={query}
  onChange={(event) => setQuery(event.target.value)}
/>;
```

`search.type("Coffee")` replaces the value through normal React input behavior.
It does not append. `clear`, `focus`, `unfocus` and Enter submission are available
as listed by discovery. Normal form validation still applies.

Password and OTP controls are excluded by default. For an application-specific
secret, set `cli.sensitive: true`. Default-private text is redacted from command
echo/history; sensitive controls remain excluded even if marked `exposeValue`.

## Groups, items and navigation

```tsx
<TerminalScope id="cart">
  <TerminalScope id="items" kind="list">
    {lines.map((line) => (
      <TerminalScope id={line.id} kind="item" key={line.id}>
        <Button
          cli={{ id: "remove", label: `Remove ${line.name}` }}
          onClick={() => removeLine(line.id)}
        >
          Remove
        </Button>
      </TerminalScope>
    ))}
  </TerminalScope>
</TerminalScope>
```

For a line ID `line-123`, use `cart.items["line-123"].remove.click()`. Use line IDs,
not just product IDs, when one product can have multiple lines. Scope components
render DOM wrappers; account for their layout in the host's design system.

A scope with `kind="screen"` and `active={false}` is hidden and excluded. A scope
with `kind="navigation"` is discoverable through `ls navigation`; its controls are
omitted from the default screen listing. Shared navigation is still unavailable
while a dialog owns the interaction layer.

## Context actions and dialogs

Buttons expose `right_click()` only when an `onContextMenu` handler is provided,
and `hold()`/`long_press()` only with `onHold`. Human and terminal interactions use
those same callbacks. `hold()` invokes one semantic interaction, not a timed OS
pointer-down.

The supplied web `Dialog` takes `id`, `open`, `title` and `children`. Its controls
use the `dialog` namespace and its layer replaces background discovery. It is a
demo primitive: adapt the host's actual modal system before claiming production
accessibility or nested-modal support.

## Custom controls

`useTerminalControl` registers an existing DOM widget. Provide its actual element
ref, metadata, role, disabled/secret state, optional public value, and supported
UI-action callbacks. Use public component refs, not React internals. The hook
supplies DOM geometry/reveal/hit-testing behavior and applies the current scope.

The callback must be the widget's normal interaction path. Do not create a second
API call or state mutation solely for terminal use. Unsupported widget actions
must remain absent from discovery. The current preview has no general control of
arbitrary third-party widgets, shadow trees, virtualized datasets or iframes.

For explicit save results, return `confirmed(...)` from the existing UI handler.
See the [README example](../README.md#add-controls) and [stream contract](STREAMS.md).

## Readout

`Readout` renders an ordinary div and registers role `readout`, an empty action
set, optional primitive `value` and bounded primitive `detail`. Props/refs and
children are forwarded; with no children it displays the string value, including
zero/false. `cli.label` and `cli.description` describe the information; `cli.id`
selects a stable path under the current scope. Value exposure defaults on for
readouts. `cli.sensitive` excludes the complete descriptor; explicitly supplied
public detail is not a secret-field escape hatch. Only register information
already shown to the current user. Hidden/inactive/underlying-dialog content is
excluded by the same adapter/runtime as buttons. No click/type handler exists.
Custom `useTerminalControl` registrations may now supply the same public `detail`.

## Filtered discovery (dev.3)

Use `ls --tree` for the current namespaces, then `ls --tree cart` to drill down.
Namespace rows are inspection-only summaries, not new actionable controls.
`ls --role readout` lists information; `ls --find "stock"` matches public labels,
descriptions, paths, values and metadata. These filters compose with a path or
`--visible`/`--all`. Private field values and secret/background/modal-excluded
controls are never searched. UI content remains data, never agent instructions.

`ls --limit 20 --offset 0` pages discovery with matched/offset/limit/nextOffset
metadata. The host maximum still caps page size; truncation/output limits remain
explicit. Pages do not establish a complete delta baseline. Use a narrower group
for `ls --changes`; filters persist on its most recent complete query. Stable
record IDs are preferred. Automatic component IDs live for the mounted widget,
so rediscover after navigation or remount. Discovery never submits or retries a
UI action and does not prove a durable save. No network listener is introduced.

Add `--json` to any `ls` query to display the structured snapshot in the visible terminal (the stream itself always carries structured events). For example: `ls --json --role readout --find "stock"`.
