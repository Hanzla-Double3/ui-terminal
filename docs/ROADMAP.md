# Local prototype and next steps

Implemented in this local web preview:

- Independent TypeScript command engine, one input/output owner and local streams.
- Declarative React buttons/fields/readouts/scopes, stable quoted-key paths, public-ref DOM
  geometry and shared normal handlers; optional metadata and custom-control hook.
- Current screen/dialog discovery, shared navigation, visible-only inspection,
  scoped revision deltas and explicit truncation/baseline errors.
- Disabled/hidden/secret checks, cursor-time revalidation, session revocation,
  bounded output/history and explicit dispatch/host-receipt distinction.
- Resizable/minimizable visible panel, pointer, history/completion, configurable
  title/style/CSS variables, plus an independent demo in light/dark appearance.

Before calling this a public beta:

1. Test more real applications and third-party widgets, not only the fixture.
2. Add native adapters and a native panel; verify Android independently. Preserve
   these commands and stream semantics. iOS remains unverified until separately tested.
3. Add list/scroll adapters, virtualized-row reveal, richer form controls, nested
   dialog integration and router adapters with explicit availability contracts.
4. Finish stricter event phases, custom renderer/stream configuration, bounded
   external ingress/backpressure and measured performance budgets.
5. Validate FayPOS’s pinned integration: it owns native adapters/panel and
   preserves old command aliases and normal business checks. Its walkthrough
   contracts and platform acceptance must be reviewed before a release.
6. Owner chooses project name, public scope and licence. Complete attribution,
   contributing/security docs, package review and compatibility tests before publishing.

After the user-facing terminal is verified, build a local-server attachment with
consent/authentication and exclusive controller ownership. Agent and test clients
then send these same command lines and consume these same output events. No
parallel feature-specific action API or model dependency is planned.

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

Local OS-pipe/stdio attachments are now implemented experimentally (dev.4), with
per-workspace pairing/trust policies and bounded exclusive ownership. Remote
network access and browser/Android transport adapters remain deferred. See
[local connections](LOCAL_CONNECTIONS.md) for the current acceptance boundary.
