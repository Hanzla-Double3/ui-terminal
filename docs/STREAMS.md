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
