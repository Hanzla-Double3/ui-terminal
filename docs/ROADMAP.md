# Local prototype and next steps

Implemented in this local web preview:

- Independent TypeScript command engine, one input/output owner and local streams.
- Declarative React buttons/fields/scopes, stable quoted-key paths, public-ref DOM
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
5. Validate FayPOS’s pinned dev.1 integration: it owns native adapters/panel and
   preserves old command aliases and normal business checks. Its walkthrough
   contracts and platform acceptance must be reviewed before a release.
6. Owner chooses project name, public scope and licence. Complete attribution,
   contributing/security docs, package review and compatibility tests before publishing.

After the user-facing terminal is verified, build a local-server attachment with
consent/authentication and exclusive controller ownership. Agent and test clients
then send these same command lines and consume these same output events. No
parallel feature-specific action API or model dependency is planned.
