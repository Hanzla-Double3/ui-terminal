import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "..");
const consumer = mkdtempSync(path.join(tmpdir(), "ui-terminal-consumer-"));
function run(command, args, cwd = consumer, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Consumer verification failed: ${command} ${args.join(" ")}\n${result.stderr ?? ""}`,
    );
  return result.stdout;
}
try {
  const data = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", consumer], root, true),
  );
  const packed = Array.isArray(data) ? data[0] : Object.values(data)[0];
  for (const file of packed.files)
    assert.ok(
      !/^(demo|tests|scripts|node_modules|\.env|artifacts)\//.test(file.path),
      `Private/development file in package: ${file.path}`,
    );
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "independent-consumer",
      private: true,
      type: "module",
    }),
  );
  run("npm", [
    "install",
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    path.join(consumer, packed.filename),
  ]);
  assert.equal(
    existsSync(path.join(consumer, "node_modules/react")),
    false,
    "Core-only consumer should not need React",
  );
  run(process.execPath, [
    "--input-type=module",
    "-e",
    `
    import assert from 'node:assert/strict';
    import {createTerminal, createInput} from 'ui-terminal-local';
    import {connectHost, parsePath} from 'ui-terminal-local/adapter';
    import {completePrefix} from 'ui-terminal-local/completion';
    assert.equal(typeof connectHost, 'function');
    assert.deepEqual(parsePath('cart.items[0]', {allowNumericIndices:true}), ['cart','items','0']);
    assert.equal(completePrefix('cart.i', ['cart.items.remove','cart.items.add']).value, 'cart.items.');
    const terminal=createTerminal({enabled:true}), input=createInput(), events=[];
    const attachment=terminal.attach({input,output:{write:event=>events.push(event)}});
    await input.send('help');
    assert(events.some(event=>event.type==='help'));
    assert(events.some(event=>event.type==='command.finished'));
    attachment.detach(); terminal.dispose();
    console.log('Core-only installed package: passed without React or app-checkout imports.');
  `,
  ]);
  run("npm", [
    "install",
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "react@19.1.0",
    "react-dom@19.1.0",
  ]);
  run(process.execPath, [
    "--input-type=module",
    "-e",
    `
    import assert from 'node:assert/strict';
    import React from 'react';
    import {renderToString} from 'react-dom/server';
    import {TerminalProvider,Button,Field} from 'ui-terminal-local/react';
    import {TerminalPanel} from 'ui-terminal-local/panel';
    const html=renderToString(React.createElement(TerminalProvider,{enabled:true},
      React.createElement(Button,{cli:{id:'save'}},'Save'),
      React.createElement(Field,{cli:{id:'name'},readOnly:true,value:'Example'}),
      React.createElement(TerminalPanel)));
    assert(html.includes('Save')); assert(html.includes('Example'));
    assert(import.meta.resolve('ui-terminal-local/panel.css').endsWith('/src/panel/panel.css'));
    console.log('React/panel installed package: imports, server render and CSS export passed.');
  `,
  ]);
  assert.equal(
    JSON.parse(
      readFileSync(
        path.join(consumer, "node_modules/ui-terminal-local/package.json"),
      ),
    ).version,
    "0.1.0-dev.1",
  );
  console.log(
    "Independent package acceptance passed. Temporary consumer removed.",
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
