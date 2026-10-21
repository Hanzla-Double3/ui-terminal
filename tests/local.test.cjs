const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  net = require("node:net"),
  { spawn } = require("node:child_process");
const { LocalBridge, connect } = require("../transport/local.cjs");
async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uit-local-"));
  await fs.chmod(root, 0o700);
  let bridge;
  const options = {
    directory: path.join(root, "host"),
    onCommand: async ({ source }) => ({
      events: [
        {
          type: "help",
          message: source === "secret" ? "redacted" : "Safe output",
        },
      ],
    }),
  };
  const context = {
    key: "employee-1",
    target: "store/till",
    enabled: true,
    manage: true,
  };
  const start = async () => {
    bridge = await new LocalBridge(options).start();
    bridge.setContext(context);
    return bridge;
  };
  await start();
  try {
    await fn({
      root,
      get bridge() {
        return bridge;
      },
      context,
      start,
      client: (name = "test") =>
        connect({
          endpoint: bridge.endpointFile,
          identityFile: path.join(root, name, "identity.json"),
          name,
        }),
    });
  } finally {
    await bridge?.stop();
    await fs.rm(root, { recursive: true, force: true });
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
test("off refuses access, pairing code is bound and one use, only one controller", () =>
  fixture(async (h) => {
    const off = await h.client();
    assert.equal(off.initial.code, "DISABLED");
    off.close();
    await tick();
    await h.bridge.configure({ mode: "prompt", anyAccess: "read" });
    const a = await h.client("a");
    assert.equal(a.initial.status, "pairing_required");
    const pending = h.bridge.state().pending[0];
    const code = h.bridge.approve(pending.id, {
      access: "control",
      remember: true,
    });
    assert.equal((await a.authenticate("WRONG")).code, "INVALID_CODE");
    assert.equal((await a.authenticate(code.code)).status, "connected");
    const b = await h.client("b");
    assert.equal(b.initial.code, "BUSY");
    b.close();
    assert.equal(h.bridge.state().grants.length, 0);
    a.close();
    await tick();
    const retry = await h.client("a");
    assert.equal(retry.initial.status, "pairing_required");
    assert.equal(
      (await retry.authenticate(code.code)).code,
      "PAIRING_REQUIRED",
    );
    retry.close();
  }));
test("remembered public-key identity reconnects after restart and removal revokes access", () =>
  fixture(async (h) => {
    await h.bridge.configure({ mode: "trusted", anyAccess: "read" });
    let c = await h.client();
    let p = h.bridge.state().pending[0];
    const code = h.bridge.approve(p.id, { access: "read", remember: true });
    assert.equal((await c.authenticate(code.code)).status, "connected");
    c.close();
    await tick();
    await h.bridge.stop();
    await h.start();
    c = await h.client();
    assert.equal(c.initial.status, "connected");
    assert.equal(c.initial.access, "read");
    assert.equal(h.bridge.state().pending.length, 0);
    await h.bridge.forget(c.initial.clientId);
    await tick();
    const next = await h.client();
    assert.equal(next.initial.status, "pairing_required");
    next.close();
  }));
test("any-local mode needs no prompt, context changes revoke live access and keep targets separate", () =>
  fixture(async (h) => {
    await h.bridge.configure({ mode: "any", anyAccess: "control" });
    const c = await h.client();
    assert.equal(c.initial.status, "connected");
    assert.equal(h.bridge.state().pending.length, 0);
    assert.equal((await c.command("help", "first")).ok, true);
    h.bridge.setContext({ ...h.context, key: "employee-2" });
    await tick();
    assert.equal((await c.command("help", "later")).code, "DISCONNECTED");
    let next = await h.client();
    assert.equal(next.initial.status, "connected");
    next.close();
    await tick();
    h.bridge.setContext({ ...h.context, key: "other", target: "other-store" });
    next = await h.client();
    assert.equal(next.initial.code, "DISABLED");
    next.close();
  }));
test("commands are not queued and disconnect never retries an uncertain command", () =>
  fixture(async (h) => {
    let finish,
      calls = 0;
    h.bridge.onCommand = () => {
      calls++;
      return new Promise((r) => (finish = r));
    };
    await h.bridge.configure({ mode: "any", anyAccess: "control" });
    const c = await h.client();
    const pending = c.command("save.click()", "one");
    await tick();
    assert.equal((await c.command("save.click()", "two")).code, "BUSY");
    c.close();
    await pending;
    await tick();
    const next = await h.client("next");
    assert.equal(next.initial.code, "BUSY");
    next.close();
    finish({ events: [] });
    await tick();
    assert.equal(calls, 1);
  }));
test("expired approval and manager/disabled context fail closed", () =>
  fixture(async (h) => {
    let now = 1000;
    h.bridge.now = () => now;
    await h.bridge.configure({ mode: "trusted", anyAccess: "read" });
    const c = await h.client();
    const code = h.bridge.approve(h.bridge.state().pending[0].id, {
      remember: true,
    });
    now += 120001;
    const result = await c.authenticate(code.code);
    assert.ok(["PAIRING_REQUIRED", "DISCONNECTED"].includes(result.code));
    h.bridge.setContext({ ...h.context, manage: false });
    await assert.rejects(
      h.bridge.configure({ mode: "any", anyAccess: "control" }),
      /manager/,
    );
    c.close();
  }));
test("oversized frames and invalid endpoint transports cannot reach command handling", () =>
  fixture(async (h) => {
    let calls = 0;
    h.bridge.onCommand = () => {
      calls++;
    };
    const socket = net.connect(h.bridge.address);
    await new Promise((r) => socket.once("connect", r));
    socket.on("error", () => {});
    socket.resume();
    socket.write("x".repeat(20000));
    await new Promise((r) => socket.once("close", r));
    assert.equal(calls, 0);
    const bad = path.join(h.root, "bad.json");
    await fs.writeFile(
      bad,
      JSON.stringify({ version: 1, address: "127.0.0.1:8080", gate: "x" }),
      { mode: 0o600 },
    );
    await assert.rejects(
      connect({
        endpoint: bad,
        identityFile: path.join(h.root, "identity.json"),
      }),
      /local OS pipe/,
    );
  }));
test("stdio child connector emits structured events and survives separate invocations with its identity", () =>
  fixture(async (h) => {
    await h.bridge.configure({ mode: "any", anyAccess: "read" });
    const child = spawn(
      process.execPath,
      [
        path.resolve(__dirname, "../transport/connect.cjs"),
        "--endpoint",
        h.bridge.endpointFile,
        "--identity",
        path.join(h.root, "stdio", "identity.json"),
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let text = "",
      error = "";
    child.stderr.on("data", (c) => (error += c));
    child.stdout.on("data", (c) => (text += c));
    for (let i = 0; i < 100 && !text.includes("connected"); i++) await tick();
    assert.ok(text.includes("connected"));
    child.stdin.write(
      JSON.stringify({ id: "agent-1", command: "help" }) + "\n",
    );
    for (let i = 0; i < 100 && !text.includes('"type":"result"'); i++)
      await tick();
    assert.ok(text.includes('"type":"event"'));
    assert.ok(text.includes("agent-1"));
    assert.equal(error, "");
    child.stdin.end();
    await new Promise((r) => child.once("exit", r));
  }));

test("Take control is available to a signed-in operator; busy human work prevents claims", () =>
  fixture(async (h) => {
    await h.bridge.configure({ mode: "any", anyAccess: "control" });
    h.bridge.available = () => false;
    let c = await h.client();
    assert.equal(c.initial.code, "BUSY");
    c.close();
    await tick();
    h.bridge.available = () => true;
    c = await h.client();
    assert.equal(c.initial.status, "connected");
    h.bridge.context.manage = false;
    h.bridge.takeControl();
    await tick();
    assert.equal((await c.command("help", "lost")).code, "DISCONNECTED");
  }));
test("corrupt saved grants fail closed without replacing the file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uit-corrupt-"));
  await fs.chmod(root, 0o700);
  const file = path.join(root, "access.json");
  await fs.writeFile(file, "broken", { mode: 0o600 });
  try {
    await assert.rejects(
      new LocalBridge({ directory: root, onCommand() {} }).start(),
      /could not be read/,
    );
    assert.equal(await fs.readFile(file, "utf8"), "broken");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("one-shot stdin EOF drains its accepted command result before exiting", () =>
  fixture(async (h) => {
    await h.bridge.configure({ mode: "any", anyAccess: "read" });
    const child = spawn(
      process.execPath,
      [
        path.resolve(__dirname, "../transport/connect.cjs"),
        "--endpoint",
        h.bridge.endpointFile,
        "--identity",
        path.join(h.root, "oneshot", "identity.json"),
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let text = "";
    child.stdout.on("data", (b) => (text += b));
    child.stderr.resume();
    child.stdin.end(JSON.stringify({ id: "once", command: "help" }) + "\n");
    await new Promise((r) => child.once("exit", r));
    assert.ok(text.includes('"type":"result","id":"once"'));
  }));

test('a proved connection cannot replace its identity with another public key',()=>fixture(async h=>{
 const {identity}=require('../transport/local.cjs'),{sign}=require('node:crypto');await h.bridge.configure({mode:'trusted',anyAccess:'read'});
 const a=await identity(path.join(h.root,'raw-a','key.json')),b=await identity(path.join(h.root,'raw-b','key.json')),endpoint=JSON.parse(await fs.readFile(h.bridge.endpointFile,'utf8'));
 const socket=net.connect(h.bridge.address);let buffer='',resolve;socket.on('error',()=>{});socket.on('data',chunk=>{buffer+=chunk;for(let n;(n=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);resolve?.(JSON.parse(line));}});await new Promise(r=>socket.once('connect',r));
 const request=value=>new Promise(r=>{resolve=r;socket.write(JSON.stringify(value)+'\n');});
 const challenge=await request({id:'hello',op:'hello',gate:endpoint.gate,publicKey:a.publicKey});const proved=await request({id:'proof',op:'authenticate',signature:sign(null,Buffer.from(challenge.challenge),a.privateKey).toString('base64url')});assert.equal(proved.status,'pairing_required');
 const closed=new Promise(r=>socket.once('close',r));socket.write(JSON.stringify({id:'replace',op:'hello',gate:endpoint.gate,publicKey:b.publicKey})+'\n');await closed;assert.equal(h.bridge.state().active,null);assert.equal(h.bridge.state().pending.length,0);
}));
