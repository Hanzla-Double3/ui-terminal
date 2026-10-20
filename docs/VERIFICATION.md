# Local verification — 20 October 2026

Version: `ui-terminal-local@0.1.0-dev.2`, private local prototype.

## Automated evidence

| Check                                                       | Result                                 |
| ----------------------------------------------------------- | -------------------------------------- |
| Sequential engine tests (`npm test`)                        | 32 passed, 0 failed                    |
| Browser regressions (`npm run test:browser`)                | 12 passed, 1 worker, isolated Chromium |
| TypeScript library/demo checks (`npm run build`)            | Passed                                 |
| Production demo bundle                                      | Built successfully                     |
| Independent installed-package test (`npm run test:package`) | Passed                                 |

Browser cases cover real React input events, Enter/cart updates, exactly-one
handler activation, explicit local-save receipts, scoped deltas, dialog isolation,
context/hold rename, confirmation/cancel, inactive/secret controls, failed-command
recall, shared-prefix/group completion, dock resizing/minimize/restore, disable/reopen, explicit focus,
and a 390×844 viewport without horizontal overflow.

Core tests additionally cover scope changes while output or UI work is pending,
old-session receipt rejection, remounted/relabelled targets during cursor movement,
ambiguous identities, busy submissions, output failure before/after dispatch,
unknown timeout outcomes, UTF-8 byte truncation, bounded history and redaction.

The package test packs the actual build, installs it into a fresh temporary
consumer, exercises help through its input/output pair without React installed,
then installs React/React DOM and verifies adapter imports, server rendering and
CSS export resolution. The consumer is removed afterwards. No FayPOS path or
backend service is available to that consumer.

## Visible browser acceptance

Also exercised through the visible local terminal: catalogue search, Enter add,
quantity increase/removal, saving with an explicit local receipt, collection-only
delta output, context-menu/hold rename, background-action rejection in a dialog,
failed-command recall, completion, settings/theme navigation, private-field
exclusion, disable/reopen, confirmation/cancel and restoring the dock height.

The demo uses only disposable sample stationery. Its explicit Save writes the
sample collection to that browser's local storage. No real sale, payment, account,
message, backend database or production setting was created or changed.

## Limits of this evidence

This is a local browser prototype, not the planned finished cross-platform beta.
No native/Android/iOS/Windows installation tests, external agent/server transport,
public publication or live deployment occurred in this package. FayPOS now consumes
the dev.1 archive through host-owned React Native controls and a native dock; its
UI/Metro acceptance evidence belongs to the FayPOS repository. Full SSR
hydration, arbitrary third-party widget compatibility and large virtualized-list
performance are not established by these tests. See ROADMAP.md before extending
support claims.

Completion update: Tab now fills a shared group prefix before listing alternatives;
`products.j` becomes `products.journal.`. Prefix matching considers every candidate
before limiting displayed suggestions, and ignores dots inside quoted IDs.

Adapter update: 31 core tests and 11 browser flows pass, including native UUID injection, async actionability, legacy numeric paths (opt-in only), bounded detail metadata, stale native checks and malformed private input redaction. Clean installed-package checks import the adapter and completion exports without React.

Readout update: a real browser flow inspects the rendered collection total,
changes it through the ordinary button, sees the updated value via scoped delta,
and confirms a click on the readout is rejected without changing the collection.
The installed React package renders the new Readout export; stream schema remains
0.1 with additive role/read-only values in the existing controls array.

Discovery update (dev.3): 36 core cases and 13 browser flows cover public-value search, role filters, namespace browsing, query-preserving deltas, bounded paging, invalid flags and JSON display. Large pages shrink to the output budget with an explicit nextOffset; incomplete pages never establish a delta baseline. Installed-package checks continue to cover core-only and React consumers.
