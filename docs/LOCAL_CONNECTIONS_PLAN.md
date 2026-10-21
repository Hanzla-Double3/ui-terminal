# Local terminal connections — implementation plan

Scope: desktop local IPC and a stdio connector, developed locally before release.
The portable terminal engine remains the sole interpreter/action dispatcher. No
TCP/HTTP listener, cloud service, SQL change or new POS/MCP mutation is introduced.

## Access policy per app/server/store/till

- Off (initial): refuse external access.
- Pair each session: manager approves a pending connection and supplies a short-lived one-use code.
- Remember paired programs: an approved connector's public-key identity is saved for this till; signed challenge authentication reconnects without a prompt, including after app restart.
- Allow any local program: explicit manager setting; local programs holding the current OS-profile endpoint capability connect without pairing or prompts. Choose read-only or UI control. This deliberately trusts programs running as the same OS user, not programs elsewhere on the LAN.

A connector identity is not a program name or verified executable. Copying its
private key copies that identity. A compromised OS user account is outside this
boundary. Persist only public grants/policy in the app; keep connector private keys
in its OS-user profile, never source, logs or command output. Restrict Unix
folders/files and use the protected Windows user-profile ACL boundary plus a random
per-launch endpoint capability. No secrets in process arguments.

## Host architecture

Agent/program → JSON Lines stdin/stdout connector → OS pipe → desktop main bridge
→ renderer's existing terminal input/output → ordinary UI handlers.

The standalone package owns generic framing, challenge proofs, connection policy,
identity persistence and stdio forwarding. FayPOS owns its approval/settings UI,
manager gate, store/till context and renderer IPC. Node-only exports are isolated
from web/Android bundles. First transport support is Windows/Linux desktop;
browser/Android use the normal terminal and need future host adapters.

One active external controller, one active command, no persistent command queue.
The panel observes the same sanitized events and is read-only while externally
controlled. Take control/disconnect, logout, break/lock, changed employee/server/
store, renderer loss or disabled terminal revoke the live lease and invalidate
undispatched commands. Remembered grants survive; live sessions do not. A new
valid employee session is still required. No automatic login or shift bypass.
Read-only is enforced by the interpreter before any UI action (including focus,
scroll, type and toggle). Commands/results have IDs and bounded UTF-8 frames;
overflow/concurrent requests fail explicitly. Disconnect/timeouts never retry an
uncertain mutation; Dispatched remains distinct from a confirmed durable save.

## Steps and acceptance

1. Portable interpreter access modes with cancellation across ownership changes.
2. Standalone Node transport/broker/stdio connector and isolated installed-package tests.
3. Desktop main/preload bridge and persistent per-till grants, exclusive ownership and revocation.
4. Settings modes, paired-program removal, pending approval/code dialog and connected banner/Take control.
5. Walkthrough/MCP architecture/setup documentation and protocol checks.
6. Real socket/stdio child-process tests: off, wrong/expired/reused code, remembered restart/revoke, any-local read/control, BUSY, malformed/oversized frames, disconnect/scope cancellation and secret redaction.
7. Client/full library tests, production web/native bundling and local desktop acceptance. Publication/deployment is a separate explicit release step.
