# Local connections (experimental)

The Node-only `ui-terminal-local/node` export provides `LocalBridge` and `connect`.
The `ui-terminal-connect` executable forwards JSON Lines stdin/stdout to a running
host over a Unix-domain socket or Windows local named pipe. No TCP port or HTTP
service is opened. The portable core and React/native adapters import no Node APIs.
This is the terminal protocol, not an MCP server; a future MCP adapter can relay it.

## Host integration

```js
const { LocalBridge } = require("ui-terminal-local/node");
const bridge = await new LocalBridge({
  directory: privateProfileDirectory,
  onState: (state) => showConnectionStatus(state),
  onRevoke: () => host.access("blocked", "revoked"),
  onCommand: async ({ source, controller, access }) => {
    host.access(access, controller);
    // Send only through the existing terminal input; collect its sanitized events.
    return submitThroughExistingStream(source);
  },
}).start();
bridge.setContext({
  key: currentSessionKey,
  target: stableWorkspaceKey,
  enabled: terminalEnabledAndUnlocked,
  manage: authorizedManager,
  expiresAt: sessionExpiryMilliseconds,
});
```

`onCommand` must not call a registry, domain executor, eval or shell. The host must
synchronize ownership changes into `connectHost(runtime).access(mode, owner)`;
this invalidates undispatched commands when a controller changes. `read` refuses
all UI actions in the interpreter; `blocked` refuses terminal commands. The host
must also deny human command input while an external controller owns the stream.
The visible panel can observe the same sanitized output. The host's existing
permissions, dialogs, secret filtering and durable-save checks remain mandatory.

Policies are separate per target and persist in `access.json`. Off is the default.
`prompt` pairs each connection; `trusted` remembers approved Ed25519 public-key
identities; `any` accepts programs holding the OS-profile endpoint capability
without prompting. Any-local access can be read-only or control. Pairing approval
requires `manage`; remembered credentials cannot enable access or unlock a host.
A changed/disabled/expired context revokes live sessions, not remembered grants.
The host must report break/lock, employee/workspace changes and renderer loss.

The UI calls `approve(requestId,{access,remember})` and shows its returned one-use
code (two-minute TTL). The connector supplies that code. `forget(clientId)` removes
a remembered identity; `takeControl()` disconnects the external controller.
Connector labels are self-reported, never verified program identities. Identical
private keys represent the same client even if copied or renamed.

## Connector

```bash
ui-terminal-connect --endpoint /private/profile/terminal/endpoint.json --name "My agent"
```

The host may embed `require('ui-terminal-local/connector').runConnector(args,
{onExit})` in its executable. There is no separate daemon. `--identity PATH`
selects a separate connector identity; the default is the current OS user's
`~/.ui-terminal/connector-identity.json`. Keep the same file for remembered access.

First output is a connection status. If approval is required, obtain the code from
the host UI and send it through stdin:

```json
{"id":"pair-1","op":"pair","code":"ONE-TIME-CODE"}
{"id":"inspect-1","command":"ls --json --role readout"}
{"id":"act-1","command":"search_bar.type(\"Coffee\")"}
```

Output contains `{type:"event",id,event}` with the ordinary sanitized terminal
events, followed by `{type:"result",id,ok,code?}`. Transport rejection uses
`{type:"error",id?,code}`. A result with ok means interpreter completion only;
inspect action.dispatched versus a confirmed host receipt before assuming a save.
Diagnostics use stderr. Private input and pairing keys are never echoed by the
transport. Existing discovery output may contain authorized business information.

One controller and command at a time; BUSY is not queued. Requests are UTF-8 JSON
lines (16 KiB maximum); commands remain 4096 characters. Per-command output is
bounded at 256 KiB; backpressure or overflow closes the connection. A missing
response after 30 seconds closes the connection with OUTCOME_UNKNOWN. No action
is automatically retried, including after a reconnect. Stdin EOF closes access.

## Local trust boundary

Endpoint metadata includes a per-launch 256-bit capability. Unix directories use
0700 and files/socket use 0600, with owner/type checks. On Windows, use an existing
protected OS-user profile directory and its inherited ACLs; a random named pipe
alone is not authorization. The capability is required even in any-local mode.
Remembered clients prove possession of their private key with an Ed25519 challenge.
The host persists only public grants, never connector private keys. Corrupt grants
fail closed rather than being silently replaced. Neither mode protects against a
compromised OS account that can read another program's identity files. No LAN
access, executable attestation, sandboxing or arbitrary process privilege is claimed.

Linux sockets/stdio are tested with real child processes; Windows uses the same
Node pipe implementation and still needs Windows OS acceptance before publication.
Browser and Android need future host transports and do not expose this Node export.
