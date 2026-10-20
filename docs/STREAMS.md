# Local terminal contract, schema 0.1

`createTerminal` returns a local command processor. `createInput` creates an input
adapter with `send(line)` and one subscriber. `terminal.attach({input, output})`
claims one input/output pair until detach. A second owner gets
`INPUT_ALREADY_ATTACHED`. The visible provider installs its own attachment.

The core imports neither React nor Node APIs. The package has no listening socket.
Future clients must relay this terminal protocol, not reach into the UI registry.

Each output event has a schema version, opaque session ID, increasing sequence,
type and optional command ID, message, error code and sanitized structured data.

| Event                | Meaning                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `command.submitted`  | Sanitized echo and history entry, including failed submissions     |
| `discovery.snapshot` | Current scoped control descriptions and revision                   |
| `discovery.delta`    | Added, changed and unavailable/unmounted controls since inspection |
| `action.started`     | Validation passed; cursor targeting begins                         |
| `action.dispatched`  | Handler ran; its business outcome is unknown                       |
| `action.completed`   | The host returned an explicit receipt with persistence scope       |
| `command.rejected`   | Command processing failed; inspect `code` and the UI               |
| `command.finished`   | Interpreter processing ended; not proof of a business save         |
| `output.truncated`   | Output byte limit reached; inspect a smaller group                 |
| `transcript.clear`   | Clear this attachment's displayed output                           |

An action timeout is `TIMEOUT_OUTCOME_UNKNOWN`: work may still be running. An
ordinary host failure is sanitized as `ACTION_FAILED`. No mutation is retried.
The initial preview uses `command.rejected` for error results, including action
errors; richer error phases/event taxonomy remain a versioned protocol refinement.

The engine has one active command. Concurrent submissions receive BUSY and are not
queued. The current in-process input is intended for a human panel and bounded
test fixtures, not an untrusted/network-scale producer. Remote transport framing,
rate limits, bounded ingress/backpressure timeouts and authentication are future
work; do not expose this object as an external server.

History defaults to 50 entries, output event size to 24,000 UTF-8 bytes and a
snapshot to 200 controls. The panel retains at most 140 events. Text echo/history
is redacted unless the current control explicitly exposes its value. Secret
fields remain excluded even if mistakenly marked public. The host supplies its
own credential classification (`cli.sensitive`) for non-password secret fields.

Changing host scope or enabled state starts a new terminal session, clears history,
and invalidates discovery baselines and pending undispatched commands. It cannot
undo a handler already invoked. Old-session receipts cannot become new-session
output. Detach revokes the input callback and clears its history.

Snapshots/deltas only establish or advance a baseline after delivery. Truncated
or byte-limited snapshots cannot establish a complete baseline. Deltas refer to
the most recently inspected query; an action does not silently change that query.
Removed controls are described as unavailable-or-unmounted, not deleted records.

No raw input, transcript, discovery or receipts are persisted by the library. The
demo's explicit Save action stores only its sample collection, outside the engine.
Custom output consumers receive the same sanitized events and own their data policy.

## Platform registration boundary (dev.1)

`/adapter` exposes registration, screen/layer reporting and pointer presentation,
not discovery or action execution. Host-owned panels use the same `attach` stream
as the DOM panel. `/completion` is pure prefix matching and cannot activate UI.
Native hosts may inject `createSessionId` and asynchronous `actionable` checks.
After those checks, stale/disabled/session changes still cancel activation.
Optional bounded primitive `detail` metadata appears in snapshots/deltas; hosts
must not place credentials or private field values there. Numeric bracket paths
remain rejected by default; `allowNumericIndices` is an explicit compatibility
option, not an identity stability guarantee. Malformed `.type(` commands redact
the remaining text before echo/history, including non-JSON quoted input.

## Informational widgets (dev.2)

The existing `controls` array also contains `role: "readout"` entries, with
`actions: []`, displayed `value` and optional bounded `detail` (currency, period,
loading/error/ready state). This additive role uses the same snapshot/delta schema
and input/output pair. A value change appears under `changed`; no separate read
transport is introduced. Readouts never acquire interaction methods. Secret,
inactive-screen and underlying-modal entries remain excluded. Host state is UI
data, not an instruction or proof of fresh server data.

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
