"use strict";
// Node-only transport. No domain calls, registry access, TCP listener or retries.
const net = require("node:net"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const {
  randomBytes,
  createHash,
  generateKeyPairSync,
  createPublicKey,
  sign,
  verify,
  timingSafeEqual,
} = require("node:crypto");
const MAX_FRAME = 16384,
  MAX_OUTPUT = 262144;
const hash = (v) => createHash("sha256").update(v).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (code, message) => Object.assign(new Error(message), { code });
function object(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}
function id(v) {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
}
function publicIdentity(pem) {
  if (typeof pem !== "string" || pem.length > 512)
    throw fail("INVALID_IDENTITY", "Invalid connector identity");
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== "ed25519")
    throw fail("INVALID_IDENTITY", "Ed25519 identity required");
  const publicKey = key.export({ type: "spki", format: "pem" }).toString();
  return { publicKey, clientId: hash(publicKey) };
}
async function privateDirectory(dir) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const st = await fs.lstat(dir);
  if (
    !st.isDirectory() ||
    st.isSymbolicLink() ||
    (process.platform !== "win32" &&
      (st.uid !== process.getuid() || st.mode & 0o077))
  )
    throw fail("UNSAFE_PATH", "Use a private OS-user directory");
}
async function privateRead(file) {
  const st = await fs.lstat(file);
  if (
    !st.isFile() ||
    st.isSymbolicLink() ||
    st.size > 1024 * 1024 ||
    (process.platform !== "win32" &&
      (st.uid !== process.getuid() || st.mode & 0o077))
  )
    throw fail("UNSAFE_PATH", "Invalid private file");
  return JSON.parse(await fs.readFile(file, "utf8"));
}
async function atomic(file, data) {
  const tmp = file + "." + secret() + ".tmp";
  try {
    await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600, flag: "wx" });
    await fs.rename(tmp, file);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}
async function identity(file) {
  await privateDirectory(path.dirname(file));
  try {
    const value = await privateRead(file);
    const pub = publicIdentity(value.publicKey);
    const proof = sign(null, Buffer.from("identity-check"), value.privateKey);
    if (!verify(null, Buffer.from("identity-check"), pub.publicKey, proof))
      throw fail("INVALID_IDENTITY", "Invalid private identity");
    return { ...value, ...pub };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const pair = generateKeyPairSync("ed25519"),
    value = {
      publicKey: pair.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
      privateKey: pair.privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
    };
  // Exclusive creation prevents concurrent connectors replacing a remembered identity.
  try {
    await fs.writeFile(file, JSON.stringify(value), {
      mode: 0o600,
      flag: "wx",
    });
  } catch (e) {
    if (e.code === "EEXIST") return identity(file);
    throw e;
  }
  return { ...value, ...publicIdentity(value.publicKey) };
}
function peer(socket, onMessage, onClose, maxFrame = MAX_FRAME) {
  let buffer = Buffer.alloc(0),
    closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      socket.destroy();
    }
  };
  const send = (value) => {
    const line = JSON.stringify(value) + "\n";
    if (
      Buffer.byteLength(line) > MAX_OUTPUT ||
      socket.writableLength > MAX_OUTPUT
    ) {
      close();
      return false;
    }
    if (!closed) socket.write(line);
    return !closed;
  };
  socket.on("data", (chunk) => {
    if (closed) return;
    buffer = Buffer.concat([buffer, chunk]);
    // Bound a single incoming batch as well as partial frames.
    if (buffer.length > maxFrame * 4) {
      send({ type: "error", code: "FRAME_TOO_LARGE" });
      return close();
    }
    for (let end; (end = buffer.indexOf(10)) >= 0;) {
      const line = buffer.subarray(0, end);
      buffer = buffer.subarray(end + 1);
      if (line.length > maxFrame) {
        send({ type: "error", code: "FRAME_TOO_LARGE" });
        return close();
      }
      try {
        const value = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(line),
        );
        if (!object(value)) throw Error();
        onMessage(value);
      } catch {
        send({ type: "error", code: "INVALID_FRAME" });
        close();
        return;
      }
    }
    if (buffer.length > maxFrame) {
      send({ type: "error", code: "FRAME_TOO_LARGE" });
      close();
    }
  });
  socket.on("error", () => {});
  socket.once("close", () => {
    closed = true;
    onClose?.();
  });
  return {
    send,
    close,
    get closed() {
      return closed;
    },
  };
}
class LocalBridge {
  constructor({
    directory,
    onCommand,
    onState = () => {},
    onRevoke = () => {},
    now = Date.now,
  }) {
    this.directory = directory;
    this.onCommand = onCommand;
    this.onState = onState;
    this.onRevoke = onRevoke;
    this.now = now;
    this.context = null;
    this.policies = {};
    this.connections = new Map();
    this.pending = new Map();
    this.active = null;
    this.busy = false;
    this.writing = Promise.resolve();
    this.error = "";
  }
  policy() {
    return (
      this.policies[this.context?.target] ?? {
        mode: "off",
        anyAccess: "read",
        grants: [],
      }
    );
  }
  ready() {
    return !!(
      this.context?.enabled &&
      this.context.key &&
      this.context.target &&
      (!this.context.expiresAt || this.context.expiresAt > this.now())
    );
  }
  state() {
    this.expire();
    const p = this.policy();
    return {
      supported: true,
      mode: p.mode,
      anyAccess: p.anyAccess,
      enabled: this.ready(),
      manage: !!this.context?.manage,
      error: this.error,
      endpoint: this.endpointFile,
      active: this.active
        ? {
            id: this.active.id,
            label: this.active.label,
            clientId: this.active.clientId,
            access: this.active.access,
          }
        : null,
      pending: [...this.pending.values()].map((p) => ({
        id: p.id,
        label: p.label,
        clientId: p.clientId,
        approved: !!p.codeHash,
        expiresAt: p.expiresAt,
      })),
      grants: p.grants.map(({ clientId, label, access, createdAt }) => ({
        clientId,
        label,
        access,
        createdAt,
      })),
    };
  }
  notify() {
    this.onState(this.state());
  }
  expire() {
    for (const [key, p] of this.pending)
      if (p.expiresAt <= this.now()) {
        this.pending.delete(key);
        this.connections.get(key)?.close();
      }
    if (this.active && !this.ready()) this.disconnect();
  }
  setContext(context) {
    if (
      context &&
      (!object(context) ||
        typeof context.key !== "string" ||
        typeof context.target !== "string" ||
        context.key.length > 512 ||
        context.target.length > 512)
    )
      throw fail("INVALID_CONTEXT", "Invalid host context");
    if (JSON.stringify(this.context) !== JSON.stringify(context)) {
      this.disconnect();
      for (const c of this.connections.values()) c.close();
      this.pending.clear();
      this.context = context;
      this.notify();
    }
  }
  async mutate(fn) {
    const run = this.writing
      .catch(() => {})
      .then(async () => {
        const next = JSON.parse(JSON.stringify(this.policies));
        fn(next);
        await atomic(path.join(this.directory, "access.json"), {
          version: 1,
          policies: next,
        });
        this.policies = next;
        this.error = "";
      });
    this.writing = run;
    await run;
  }
  requireManager() {
    if (!this.ready() || !this.context.manage)
      throw fail(
        "FORBIDDEN",
        "A signed-in store manager must manage external access",
      );
  }
  async configure({ mode, anyAccess }) {
    this.requireManager();
    if (
      !["off", "prompt", "trusted", "any"].includes(mode) ||
      !["read", "control"].includes(anyAccess)
    )
      throw fail("INVALID_POLICY", "Invalid connection policy");
    const target = this.context.target;
    await this.mutate((all) => {
      all[target] = { ...(all[target] ?? { grants: [] }), mode, anyAccess };
    });
    this.disconnect();
    for (const c of this.connections.values()) c.close();
    this.pending.clear();
    this.notify();
    return this.state();
  }
  async forget(clientId) {
    this.requireManager();
    const target = this.context.target;
    await this.mutate((all) => {
      if (all[target])
        all[target].grants = all[target].grants.filter(
          (g) => g.clientId !== clientId,
        );
    });
    if (this.active?.clientId === clientId) this.disconnect();
    this.notify();
    return this.state();
  }
  approve(requestId, { access = "read", remember = false } = {}) {
    this.requireManager();
    this.expire();
    const p = this.pending.get(requestId);
    if (!p || !["read", "control"].includes(access))
      throw fail("EXPIRED", "Connection request expired");
    const code = randomBytes(8).toString("hex").toUpperCase();
    Object.assign(p, {
      codeHash: hash(code),
      attempts: 0,
      access,
      remember: !!remember && this.policy().mode === "trusted",
      expiresAt: this.now() + 120000,
    });
    this.notify();
    return { code, expiresAt: p.expiresAt };
  }
  reject(requestId) {
    this.requireManager();
    this.pending.delete(requestId);
    this.connections.get(requestId)?.close();
    this.notify();
  }
  disconnect() {
    const active = this.active;
    this.active = null;
    if (active) {
      this.onRevoke(active.id);
      this.connections.get(active.id)?.close();
    }
  }
  takeControl() {
    this.requireManager();
    this.disconnect();
    this.notify();
    return this.state();
  }
  claim(connection, access) {
    if (!this.ready())
      throw fail("LOCKED", "Sign in and enable the terminal first");
    if (this.active) throw fail("BUSY", "Another controller is connected");
    if (this.busy)
      throw fail("BUSY", "A previous command still has an uncertain outcome");
    const lease = secret();
    this.active = { ...connection, access, lease, context: this.context.key };
    this.pending.delete(connection.id);
    this.notify();
    return {
      type: "connection",
      status: "connected",
      lease,
      access,
      clientId: connection.clientId,
    };
  }
  async authenticate(connection, code) {
    this.expire();
    if (!this.ready())
      throw fail("LOCKED", "Sign in and enable the terminal first");
    const p = this.policy();
    if (p.mode === "off")
      throw fail("DISABLED", "External connections are disabled");
    if (this.active) throw fail("BUSY", "Another controller is connected");
    if (p.mode === "any") return this.claim(connection, p.anyAccess);
    const grant =
      p.mode === "trusted" &&
      p.grants.find((g) => g.clientId === connection.clientId);
    if (grant) return this.claim(connection, grant.access);
    if (code !== undefined) {
      const pending = this.pending.get(connection.id);
      if (!pending?.codeHash || typeof code !== "string" || code.length > 64)
        throw fail("PAIRING_REQUIRED", "Request approval first");
      pending.attempts++;
      if (!equal(hash(code.trim().toUpperCase()), pending.codeHash)) {
        if (pending.attempts >= 5) {
          this.pending.delete(connection.id);
          this.connections.get(connection.id)?.close();
          this.notify();
        }
        throw fail("INVALID_CODE", "Invalid or expired pairing code");
      }
      this.pending.delete(connection.id);
      const context = this.context.key,
        target = this.context.target,
        policy = this.policy();
      if (pending.remember)
        await this.mutate((all) => {
          const entry = all[target];
          if (!entry || entry.mode !== "trusted")
            throw fail("SESSION_CHANGED", "Connection policy changed");
          entry.grants = entry.grants.filter(
            (g) => g.clientId !== connection.clientId,
          );
          if (entry.grants.length >= 100)
            throw fail("LIMIT", "Remove an old paired program first");
          entry.grants.push({
            clientId: connection.clientId,
            publicKey: connection.publicKey,
            label: connection.label,
            access: pending.access,
            createdAt: this.now(),
          });
        });
      if (
        !this.ready() ||
        pending.expiresAt <= this.now() ||
        this.context.key !== context ||
        (pending.remember && this.policy().mode !== "trusted") ||
        (!pending.remember && this.policy() !== policy)
      )
        throw fail("SESSION_CHANGED", "The application session changed");
      return this.claim(connection, pending.access);
    }
    if (!this.context.manage)
      throw fail(
        "MANAGER_REQUIRED",
        "Ask a manager to approve this connection",
      );
    if (!this.pending.has(connection.id)) {
      if (this.pending.size >= 4)
        throw fail("BUSY", "Too many pending approvals");
      this.pending.set(connection.id, {
        ...connection,
        expiresAt: this.now() + 120000,
      });
      this.notify();
    }
    return {
      type: "connection",
      status: "pairing_required",
      requestId: connection.id,
    };
  }
  async command(connection, request) {
    const active = this.active;
    if (
      !active ||
      active.id !== connection.id ||
      !equal(active.lease, request.lease) ||
      !this.ready() ||
      active.context !== this.context.key
    )
      throw fail("SESSION_CHANGED", "Connection is no longer authorized");
    if (this.busy)
      throw fail(
        "BUSY",
        "A command is already running; this command was not queued",
      );
    if (
      typeof request.command !== "string" ||
      !request.command.trim() ||
      request.command.length > 4096
    )
      throw fail("INVALID_COMMAND", "Invalid terminal command");
    this.busy = true;
    try {
      const result = await this.onCommand({
        source: request.command,
        controller: active.id,
        access: active.access,
        context: active.context,
      });
      if (this.active !== active)
        throw fail(
          "OUTCOME_UNKNOWN",
          "Connection changed; an action may have run. Do not retry automatically.",
        );
      return result;
    } finally {
      this.busy = false;
    }
  }
  async start() {
    await privateDirectory(this.directory);
    this.endpointFile = path.join(this.directory, "endpoint.json");
    try {
      const data = await privateRead(path.join(this.directory, "access.json"));
      if (data.version !== 1 || !object(data.policies)) throw Error();
      for (const p of Object.values(data.policies)) {
        if (
          !object(p) ||
          !["off", "prompt", "trusted", "any"].includes(p.mode) ||
          !["read", "control"].includes(p.anyAccess) ||
          !Array.isArray(p.grants) ||
          p.grants.length > 100
        )
          throw Error();
        for (const g of p.grants) {
          if (
            publicIdentity(g.publicKey).clientId !== g.clientId ||
            !["read", "control"].includes(g.access) ||
            typeof g.label !== "string" ||
            g.label.length > 80
          )
            throw Error();
        }
      }
      this.policies = data.policies;
    } catch (e) {
      if (e.code !== "ENOENT") {
        this.error =
          "Saved external-access settings could not be read. Connections remain disabled.";
        throw fail("INVALID_STORAGE", this.error);
      }
    }
    const name = hash(this.directory).slice(0, 24);
    this.address =
      process.platform === "win32"
        ? `\\\\.\\pipe\\LOCAL\\ui-terminal-${name}`
        : path.join(this.directory, "terminal.sock");
    if (process.platform !== "win32") {
      try {
        const st = await fs.lstat(this.address);
        if (!st.isSocket() || st.uid !== process.getuid())
          throw fail("UNSAFE_PATH", "Unsafe existing socket");
        const alive = await new Promise((resolve) => {
          const probe = net.connect(this.address);
          probe.once("connect", () => {
            probe.destroy();
            resolve(true);
          });
          probe.once("error", () => resolve(false));
        });
        if (alive) throw fail("IN_USE", "Local terminal already running");
        await fs.unlink(this.address);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    this.gate = secret();
    this.server = net.createServer((socket) => this.accept(socket));
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.address, resolve);
    });
    this.server.on("error", () => {
      this.error = "Local connection endpoint failed";
      this.disconnect();
      this.notify();
    });
    if (process.platform !== "win32") await fs.chmod(this.address, 0o600);
    await atomic(this.endpointFile, {
      version: 1,
      address: this.address,
      gate: this.gate,
    });
    this.timer = setInterval(() => {
      this.expire();
    }, 1000);
    this.timer.unref();
    this.notify();
    return this;
  }
  accept(socket) {
    if (this.connections.size >= 16) {
      socket.destroy();
      return;
    }
    const connection = { id: secret(), label: "Local program" },
      state = { proved: false, challenge: null, authBusy: false };
    const io = peer(
      socket,
      (request) => {
        void (async () => {
          try {
            if (!id(request.id))
              throw fail("INVALID_REQUEST", "A bounded request ID is required");
            if (request.op === "hello") {
              if (state.challenge || !equal(request.gate, this.gate))
                throw fail("UNAUTHORIZED", "Invalid local endpoint capability");
              Object.assign(connection, publicIdentity(request.publicKey), {
                label:
                  typeof request.name === "string"
                    ? request.name
                        .replace(/[\x00-\x1f\x7f]/g, "")
                        .slice(0, 80) || "Local program"
                    : "Local program",
              });
              state.challenge = secret();
              return io.send({
                type: "challenge",
                id: request.id,
                challenge: state.challenge,
              });
            }
            if (request.op === "authenticate") {
              if (state.authBusy)
                throw fail("BUSY", "Authentication already in progress");
              state.authBusy = true;
              try {
                if (!state.proved) {
                  if (
                    !state.challenge ||
                    typeof request.signature !== "string" ||
                    request.signature.length > 128 ||
                    !verify(
                      null,
                      Buffer.from(state.challenge),
                      connection.publicKey,
                      Buffer.from(request.signature, "base64url"),
                    )
                  )
                    throw fail("UNAUTHORIZED", "Invalid identity proof");
                  state.proved = true;
                  state.challenge = null;
                }
                const result = await this.authenticate(
                  connection,
                  request.code,
                );
                return io.send({ ...result, id: request.id });
              } finally {
                state.authBusy = false;
              }
            }
            if (request.op === "command" && state.proved) {
              const result = await this.command(connection, request);
              let bytes = 0;
              for (const event of result.events ?? []) {
                const frame = { type: "event", id: request.id, event };
                bytes += Buffer.byteLength(JSON.stringify(frame));
                if (bytes > MAX_OUTPUT)
                  throw fail("OUTPUT_TOO_LARGE", "Inspect a smaller group");
                if (!io.send(frame)) return;
              }
              return io.send({
                type: "result",
                id: request.id,
                ok: !result.error,
                ...(result.error ? { code: result.error } : {}),
              });
            }
            throw fail("UNAUTHORIZED", "Authenticate before sending commands");
          } catch (e) {
            io.send({
              type: "error",
              id: id(request.id) ? request.id : undefined,
              code: e.code ?? "REQUEST_FAILED",
              message: [
                "UNAUTHORIZED",
                "INVALID_REQUEST",
                "INVALID_IDENTITY",
              ].includes(e.code)
                ? "Connection request rejected"
                : e.code
                  ? "Request could not be completed: " + e.code
                  : "Request failed",
            });
            if (
              ["UNAUTHORIZED", "INVALID_REQUEST", "INVALID_IDENTITY"].includes(
                e.code,
              )
            )
              io.close();
          }
        })();
      },
      () => {
        this.connections.delete(connection.id);
        this.pending.delete(connection.id);
        if (this.active?.id === connection.id) {
          this.active = null;
          this.onRevoke(connection.id);
        }
        this.notify();
      },
    );
    this.connections.set(connection.id, io);
    const timer = setTimeout(() => {
      if (!state.proved) io.close();
    }, 10000);
    timer.unref();
    socket.once("close", () => clearTimeout(timer));
  }
  async stop() {
    clearInterval(this.timer);
    this.disconnect();
    for (const c of this.connections.values()) c.close();
    if (this.server) await new Promise((resolve) => this.server.close(resolve));
    try {
      const value = await privateRead(this.endpointFile);
      if (equal(value.gate, this.gate)) await fs.unlink(this.endpointFile);
    } catch {}
  }
}
async function connect({
  endpoint,
  identityFile,
  name = "Local program",
  onMessage = () => {},
  onClose = () => {},
}) {
  const info = await privateRead(endpoint);
  if (
    info.version !== 1 ||
    typeof info.address !== "string" ||
    typeof info.gate !== "string"
  )
    throw fail("INVALID_ENDPOINT", "Invalid endpoint");
  if (
    process.platform === "win32"
      ? !/^\\\\\.\\pipe\\LOCAL\\ui-terminal-[a-f0-9]{24}$/.test(info.address)
      : info.address !== path.join(path.dirname(endpoint), "terminal.sock")
  )
    throw fail("INVALID_ENDPOINT", "Endpoint must be a local OS pipe");
  const keys = await identity(identityFile),
    socket = net.connect(info.address);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  let lease,
    closed = false,
    counter = 0;
  const requests = new Map();
  const io = peer(
    socket,
    (message) => {
      const pending = requests.get(message.id);
      if (message.type === "event") {
        onMessage(message);
        return;
      }
      if (pending) {
        requests.delete(message.id);
        pending(message);
      } else onMessage(message);
    },
    () => {
      closed = true;
      for (const resolve of requests.values())
        resolve({
          type: "error",
          code: "DISCONNECTED",
          message:
            "Connection lost; an action may have run. Do not retry automatically.",
        });
      requests.clear();
      onClose();
    },
    MAX_OUTPUT,
  );
  const request = (value) =>
    new Promise((resolve) => {
      if (closed)
        return resolve({ type: "error", id: value.id, code: "DISCONNECTED" });
      const key = value.id ?? "c" + ++counter;
      if (!id(key) || requests.has(key))
        return resolve({ type: "error", id: key, code: "DUPLICATE_ID" });
      const timeout = setTimeout(() => {
        requests.delete(key);
        resolve({
          type: "error",
          id: key,
          code: "OUTCOME_UNKNOWN",
          message: "No response; do not automatically retry.",
        });
        io.close();
      }, 30000);
      timeout.unref();
      requests.set(key, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });
      if (!io.send({ ...value, id: key })) {
        requests.delete(key);
        clearTimeout(timeout);
        resolve({ type: "error", id: key, code: "DISCONNECTED" });
      }
    });
  const challenge = await request({
    op: "hello",
    gate: info.gate,
    publicKey: keys.publicKey,
    name,
  });
  if (challenge.type !== "challenge") {
    io.close();
    throw fail(challenge.code ?? "UNAUTHORIZED", "Local connection failed");
  }
  let signature = sign(
    null,
    Buffer.from(challenge.challenge),
    keys.privateKey,
  ).toString("base64url");
  const authenticate = async (code) => {
    const result = await request({
      op: "authenticate",
      signature,
      ...(code === undefined ? {} : { code }),
    });
    signature = undefined;
    if (result.status === "connected") lease = result.lease;
    return result;
  };
  const initial = await authenticate();
  return {
    initial,
    authenticate,
    command: (command, id) => request({ op: "command", command, id, lease }),
    close: io.close,
  };
}
module.exports = {
  LocalBridge,
  connect,
  privateDirectory,
  identity,
  MAX_FRAME,
};
