import { test } from "node:test";
import assert from "node:assert/strict";
import { createInput, createTerminal, confirmed } from "../dist/core/index.js";
import { getHost } from "../dist/core/runtime.js";
import { parse, parsePath, formatPath } from "../dist/core/language.js";
import { completePrefix } from "../dist/panel/completion.js";

test("Tab expands the shared group before showing descendant options", () => {
  const commands = [
    "products.journal.add",
    "products.journal.add.click()",
    "products.journal.add.hold()",
  ];
  assert.equal(
    completePrefix("products.j", commands).value,
    "products.journal.",
  );
  assert.equal(
    completePrefix(
      "ls products.j",
      commands.map((value) => `ls ${value}`),
    ).value,
    "ls products.journal.",
  );
  assert.equal(
    completePrefix("search.ty", ['search.type("")']).value,
    'search.type("")',
  );
  assert.equal(completePrefix("unknown", commands).total, 0);
});

test("Tab considers every match before applying the suggestion display limit", () => {
  const commands = [
    ...Array.from(
      { length: 10 },
      (_, index) => `products.journal.option_${index}.click()`,
    ),
    "products.jigsaw.add.click()",
  ];
  const result = completePrefix("products.j", commands);
  assert.equal(result.value, "products.j");
  assert.equal(result.total, 11);
  assert.equal(result.options.length, 8);
});

test("Tab never treats a dot inside a quoted item ID as a group boundary", () => {
  const prefix = 'cart.items["line';
  const result = completePrefix(prefix, [
    'cart.items["line.notes"].remove',
    'cart.items["line.notes"].remove.click()',
  ]);
  assert.equal(result.value, 'cart.items["line.notes"].');
});

function fixture(options = {}) {
  const runtime = createTerminal({ enabled: true, ...options });
  const input = createInput(),
    events = [],
    calls = [];
  const attachment = runtime.attach({
    input,
    output: {
      write: (event) => {
        events.push(event);
      },
    },
  });
  const host = getHost(runtime);
  function add(path, overrides = {}) {
    const descriptor = {
      path: parsePath(path),
      label: path,
      role: "button",
      active: true,
      layer: "root",
      shared: false,
      disabled: false,
      measure: async () => ({ x: 1, y: 2, width: 80, height: 30 }),
      actionable: () => true,
      actions: {
        click: () => {
          calls.push(path);
        },
      },
      ...overrides,
    };
    return { descriptor, remove: host.register(() => descriptor) };
  }
  return {
    runtime,
    input,
    events,
    calls,
    host,
    add,
    attachment,
    last: (type) => events.filter((event) => event.type === type).at(-1),
    error: () => events.filter((event) => event.code).at(-1)?.code,
  };
}

test("quoted stable keys round trip without evaluating JavaScript", () => {
  const path = ["cart", "items", 'a. "different" [key] 😊', "remove"];
  assert.deepEqual(parsePath(formatPath(path)), path);
  assert.deepEqual(parsePath(formatPath(["a-root-key", "delete"])), [
    "a-root-key",
    "delete",
  ]);
  assert.equal(
    parse(`search.type(${JSON.stringify('Hello "world"!')})`).kind,
    "action",
  );
  for (const source of [
    "process.exit()",
    "x.constructor.click()",
    'x["__proto__"].click()',
    "x.click(); x.click()",
    'x.type({"a":1})',
    "x.scroll(Infinity)",
    'x.scroll("2")',
    'x.press("Escape")',
    "x[0].click()",
    "x.type(()=>1)",
  ])
    assert.throws(() => parse(source), undefined, source);
  assert.throws(() => parse("x".repeat(4097)));
});

test("one active attachment, explicit detach and independent runtimes", async () => {
  const h = fixture(),
    another = createInput();
  assert.throws(
    () => h.runtime.attach({ input: another, output: { write() {} } }),
    /active input/,
  );
  h.attachment.detach();
  await assert.rejects(h.input.send("help"), /No terminal/);
  const connection = h.runtime.attach({
    input: another,
    output: { write() {} },
  });
  await another.send("help");
  connection.detach();
  const separate = fixture();
  separate.add("other");
  await separate.input.send("ls");
  assert.equal(separate.last("discovery.snapshot").data.controls.length, 1);
});

test("terminal defaults disabled and never dispatches while disabled", async () => {
  const h = fixture({ enabled: false });
  h.add("save");
  await h.input.send("save.click()");
  assert.equal(h.error(), "DISABLED");
  assert.equal(h.calls.length, 0);
  h.runtime.configure({ enabled: true });
  await h.input.send("save.click()");
  assert.equal(h.calls.length, 1);
});

test("screen listing omits repeated shared navigation; inspection never activates controls", async () => {
  const h = fixture();
  h.add("navigation.settings", { shared: true });
  h.add("search");
  h.add("background", { active: false });
  await h.input.send("ls");
  const snapshot = h.last("discovery.snapshot").data;
  assert.deepEqual(
    snapshot.controls.map((row) => row.path),
    ["search"],
  );
  assert.equal(snapshot.omittedNavigation, 1);
  await h.input.send("ls navigation");
  assert.equal(
    h.last("discovery.snapshot").data.controls[0].path,
    "navigation.settings",
  );
  await h.input.send("ls --all");
  assert.equal(h.last("discovery.snapshot").data.controls.length, 2);
  assert.equal(h.calls.length, 0);
});

test("subtree matching uses segments, not string prefixes", async () => {
  const h = fixture();
  h.add('cart.items["line-1"].remove');
  h.add("cartoon.remove");
  await h.input.send("ls cart");
  assert.equal(h.last("discovery.snapshot").data.controls.length, 1);
  await h.input.send('cart.items["line-1"].remove.click()');
  assert.deepEqual(h.calls, ['cart.items["line-1"].remove']);
});

test("dialog layers replace background controls and restore them on close", async () => {
  const h = fixture();
  h.add("clear");
  h.add("dialog.confirm", { layer: "confirm" });
  h.host.layer("confirm", true);
  await h.input.send("ls");
  assert.deepEqual(
    h.last("discovery.snapshot").data.controls.map((row) => row.path),
    ["dialog.confirm"],
  );
  await h.input.send("clear.click()");
  assert.equal(h.error(), "NOT_FOUND");
  h.host.layer("confirm", false);
  await h.input.send("clear.click()");
  assert.deepEqual(h.calls, ["clear"]);
});

test("disabled, absent, obscured and unsupported controls never dispatch", async () => {
  const h = fixture();
  h.add("disabled", { disabled: true });
  h.add("covered", { actionable: () => false });
  h.add("ordinary");
  for (const [command, code] of [
    ["disabled.click()", "DISABLED_CONTROL"],
    ["missing.click()", "NOT_FOUND"],
    ["covered.click()", "NOT_ACTIONABLE"],
    ["ordinary.hold()", "UNKNOWN_ACTION"],
  ]) {
    await h.input.send(command);
    assert.equal(h.error(), code);
  }
  assert.equal(h.calls.length, 0);
});

test("duplicate IDs are ambiguous and cannot select an arbitrary instance", async () => {
  const h = fixture();
  h.add("save");
  h.add("save");
  await h.input.send("save.click()");
  assert.equal(h.error(), "AMBIGUOUS_TARGET");
  assert.equal(h.calls.length, 0);
});

test("remounted/relabelled/disabled controls are revalidated after pointer movement", async () => {
  for (const mutate of ["remount", "label", "disabled"]) {
    let during;
    const h = fixture({ point: async () => during() });
    const target = h.add("save");
    during = () => {
      if (mutate === "remount") {
        target.remove();
        h.add("save");
      }
      if (mutate === "label") target.descriptor.label = "Different operation";
      if (mutate === "disabled") target.descriptor.disabled = true;
    };
    await h.input.send("save.click()");
    assert.ok(["STALE_TARGET", "DISABLED_CONTROL"].includes(h.error()));
    assert.equal(h.calls.length, 0);
  }
});

test("disable or scope change during cursor movement cancels pending dispatch", async () => {
  for (const change of [{ enabled: false }, { scope: "next-employee" }]) {
    let runtime;
    const h = fixture({ point: async () => runtime.configure(change) });
    runtime = h.runtime;
    h.add("save");
    await h.input.send("save.click()");
    assert.equal(h.calls.length, 0);
    assert.equal(h.runtime.getState().history.length, 0);
  }
});

test("detachment during cursor movement revokes input ownership", async () => {
  let detach;
  const h = fixture({ point: async () => detach() });
  detach = h.attachment.detach;
  h.add("save");
  await h.input.send("save.click()");
  assert.equal(h.calls.length, 0);
  assert.equal(h.runtime.getState().attached, false);
});

test("busy submissions are explicitly rejected, recorded and never queued", async () => {
  let finish, started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const h = fixture();
  h.add("save", {
    actions: {
      click: () => {
        h.calls.push("save");
        started();
        return pending;
      },
    },
  });
  const first = h.input.send("save.click()");
  await ready;
  await h.input.send("save.click()");
  assert.equal(h.error(), "BUSY");
  assert.equal(h.calls.length, 1);
  finish();
  await first;
  assert.equal(h.runtime.getState().history.length, 2);
});

test("an explicit host receipt differs from a void dispatch and output sequences stay ordered", async () => {
  const h = fixture();
  h.add("plain");
  h.add("save", {
    actions: {
      click: async () =>
        confirmed({
          persistence: "local",
          sync: "pending",
          message: "Saved locally.",
        }),
    },
  });
  await h.input.send("plain.click()");
  assert.equal(h.last("action.dispatched").data.kind, "outcome-unknown");
  await h.input.send("save.click()");
  assert.equal(h.last("action.completed").data.persistence, "local");
  assert.equal(h.last("action.completed").data.sync, "pending");
  assert.deepEqual(
    h.events.map((event) => event.sequence),
    Array.from({ length: h.events.length }, (_, index) => index + 1),
  );
});

test("delta baselines are scoped, do not repeat unchanged navigation, and reset with host scope", async () => {
  const h = fixture();
  h.add("navigation.home", { shared: true });
  const item = h.add("cart.remove");
  await h.input.send("ls cart");
  item.descriptor.disabled = true;
  h.add("cart.save");
  await h.input.send("ls --changes");
  let delta = h.last("discovery.delta").data;
  assert.equal(delta.changed[0].path, "cart.remove");
  assert.equal(delta.added[0].path, "cart.save");
  assert.doesNotMatch(JSON.stringify(delta), /navigation/);
  item.remove();
  await h.input.send("ls --changes");
  delta = h.last("discovery.delta").data;
  assert.equal(delta.removed[0].path, "cart.remove");
  h.runtime.configure({ scope: "new-user" });
  await h.input.send("ls --changes");
  assert.equal(h.error(), "BASELINE_REQUIRED");
});

test("truncated discovery cannot become a false complete delta baseline", async () => {
  const h = fixture({ maxControls: 1 });
  h.add("one");
  h.add("two");
  await h.input.send("ls");
  assert.equal(h.last("discovery.snapshot").data.truncated, true);
  await h.input.send("ls --changes");
  assert.equal(h.error(), "BASELINE_REQUIRED");
});

test("secret fields are never listed or invoked and private text is redacted before output/history", async () => {
  const h = fixture();
  h.add("password", {
    secret: true,
    exposeValue: true,
    value: "saved-secret",
    actions: {
      type: () => {
        h.calls.push("secret");
      },
    },
  });
  h.add("private_field", { role: "field", actions: { type: () => {} } });
  await h.input.send("ls --all");
  assert.doesNotMatch(JSON.stringify(h.events), /password|saved-secret/);
  await h.input.send('password.type("entered-secret")');
  await h.input.send('private_field.type("private-text")');
  await h.input.send('missing.type("failed-secret")');
  assert.equal(h.calls.length, 0);
  assert.doesNotMatch(
    JSON.stringify([h.events, h.runtime.getState().history]),
    /entered-secret|private-text|failed-secret/,
  );
  assert.equal(h.runtime.getState().history.at(-1).replayable, false);
});

test("history includes failed commands, remains bounded, and allows public text replay", async () => {
  const h = fixture({ maxHistory: 3 });
  h.add("search", { exposeValue: true, actions: { type: () => {} } });
  for (const line of [
    "help",
    "missing.click()",
    "bad.click(",
    'search.type("Coffee")',
  ])
    await h.input.send(line);
  assert.deepEqual(
    h.runtime.getState().history.map((row) => row.text),
    ["missing.click()", "bad.click(", 'search.type("Coffee")'],
  );
  assert.equal(h.runtime.getState().history.at(-1).replayable, true);
});

test("failed output revokes ownership before an action and cannot cause automatic retries", async () => {
  const runtime = createTerminal({ enabled: true }),
    input = createInput();
  let calls = 0;
  const descriptor = {
    path: ["save"],
    label: "Save",
    role: "button",
    active: true,
    layer: "root",
    shared: false,
    disabled: false,
    measure: async () => ({ x: 1, y: 2, width: 10, height: 10 }),
    actionable: () => true,
    actions: {
      click: () => {
        calls++;
      },
    },
  };
  getHost(runtime).register(() => descriptor);
  runtime.attach({
    input,
    output: {
      write: async () => {
        throw new Error("private output details");
      },
    },
  });
  await input.send("save.click()");
  assert.equal(calls, 0);
  assert.equal(runtime.getState().attached, false);
  assert.match(runtime.getState().error, /OUTPUT_FAILED/);
  assert.doesNotMatch(runtime.getState().error, /private output/);
});

test("timeout reports an unknown outcome without retrying a host operation", async () => {
  const h = fixture({ actionTimeoutMs: 15 });
  h.add("save", {
    actions: {
      click: () => {
        h.calls.push("save");
        return new Promise(() => {});
      },
    },
  });
  await h.input.send("save.click()");
  assert.equal(h.error(), "TIMEOUT_OUTCOME_UNKNOWN");
  assert.equal(h.calls.length, 1);
  assert.equal(h.runtime.getState().busy, false);
});

test("visible-only listing checks actionability, and fresh input adapters cannot hijack existing subscribers", async () => {
  const h = fixture();
  h.add("visible");
  h.add("offscreen", { actionable: () => false });
  await h.input.send("ls --visible");
  assert.deepEqual(
    h.last("discovery.snapshot").data.controls.map((row) => row.path),
    ["visible"],
  );
  assert.throws(() => h.input.subscribe(async () => {}), /already attached/);
});

test("a host-scope change during slow output cannot dispatch the old command in the new scope", async () => {
  const runtime = createTerminal({ enabled: true }),
    input = createInput();
  let release, started;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  let calls = 0;
  getHost(runtime).register(() => ({
    path: ["save"],
    label: "Save",
    role: "button",
    active: true,
    layer: "root",
    shared: false,
    disabled: false,
    measure: async () => ({ x: 1, y: 2, width: 20, height: 20 }),
    actionable: () => true,
    actions: {
      click: () => {
        calls++;
      },
    },
  }));
  runtime.attach({
    input,
    output: {
      write: async () => {
        started();
        await pending;
      },
    },
  });
  const command = input.send("save.click()");
  await ready;
  runtime.configure({ scope: "new-owner" });
  release();
  await command;
  assert.equal(calls, 0);
  assert.equal(runtime.getState().history.length, 0);
});

test("an async completion from an old host scope is never delivered as a new-session receipt", async () => {
  let finish, started;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const h = fixture();
  h.add("save", {
    actions: {
      click: () => {
        started();
        return pending;
      },
    },
  });
  const command = h.input.send("save.click()");
  await ready;
  h.runtime.configure({ scope: "new-owner" });
  finish(confirmed({ persistence: "server", message: "Old private outcome" }));
  await command;
  assert.equal(h.last("action.completed"), undefined);
  assert.doesNotMatch(JSON.stringify(h.events), /Old private outcome/);
});

test("byte-truncated snapshots cannot silently establish an undisclosed baseline", async () => {
  const h = fixture({ maxOutputBytes: 1024 });
  for (let index = 0; index < 10; index++)
    h.add(`item_${index}`, { label: "🌿".repeat(100) });
  await h.input.send("ls");
  assert.ok(h.last("output.truncated"));
  await h.input.send("ls --changes");
  assert.equal(h.error(), "BASELINE_REQUIRED");
});

test("output failure after dispatch reports a disconnected stream and never repeats the mutation", async () => {
  const runtime = createTerminal({ enabled: true }),
    input = createInput();
  let calls = 0;
  getHost(runtime).register(() => ({
    path: ["save"],
    label: "Save",
    role: "button",
    active: true,
    layer: "root",
    shared: false,
    disabled: false,
    measure: async () => ({ x: 1, y: 2, width: 20, height: 20 }),
    actionable: () => true,
    actions: {
      click: () => {
        calls++;
      },
    },
  }));
  runtime.attach({
    input,
    output: {
      write: (event) => {
        if (event.type === "action.dispatched") throw Error("Disconnected");
      },
    },
  });
  await input.send("save.click()");
  assert.equal(calls, 1);
  assert.equal(runtime.getState().attached, false);
});

test("invalid memory/time budgets cannot disable bounded-session protections", () => {
  for (const options of [
    { maxHistory: 0 },
    { maxControls: NaN },
    { maxOutputBytes: 10 },
    { actionTimeoutMs: Infinity },
  ])
    assert.throws(() => createTerminal(options), /must be an integer/);
});
