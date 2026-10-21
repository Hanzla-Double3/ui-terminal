#!/usr/bin/env node
"use strict";
const path = require("node:path"),
  os = require("node:os");
const { connect, MAX_FRAME } = require("./local.cjs");
function runConnector(
  args = process.argv.slice(2),
  {
    onExit = (code) => {
      process.exitCode = code;
    },
  } = {},
) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !["--endpoint", "--identity", "--name"].includes(args[i]) ||
      !args[i + 1] ||
      options[args[i]]
    ) {
      console.error(
        "Usage: ui-terminal-connect --endpoint PATH [--identity PATH] [--name LABEL]",
      );
      onExit(2);
      return;
    }
    options[args[i]] = args[i + 1];
  }
  if (!options["--endpoint"]) {
    console.error("Supply the local endpoint path shown by the app.");
    onExit(2);
    return;
  }
  const endpoint = path.resolve(options["--endpoint"]),
    identityFile = path.resolve(
      options["--identity"] ||
        path.join(os.homedir(), ".ui-terminal", "connector-identity.json"),
    );
  let client,
    buffer = Buffer.alloc(0),
    busy = false,
    stopped = false;
  function output(message) {
    if (stopped) return;
    if (process.stdout.writableLength > 262144) {
      stop(1);
      return;
    }
    process.stdout.write(JSON.stringify(message) + "\n");
  }
  function stop(code = 0) {
    if (stopped) return;
    stopped = true;
    client?.close();
    process.stdin.pause();
    onExit(code);
  }
  process.stdout.on("error", () => stop(1));
  process.stdin.on("error", () => stop(1));
  process.once("SIGTERM", () => stop());
  process.once("SIGINT", () => stop());
  (async () => {
    client = await connect({
      endpoint,
      identityFile,
      name: options["--name"] || "Local program",
      onMessage: output,
      onClose: () => {
        output({
          type: "connection",
          status: "disconnected",
          message: "Do not automatically retry an uncertain action.",
        });
        stop();
      },
    });
    output(client.initial);
    process.stdin.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_FRAME * 4) {
        output({ type: "error", code: "FRAME_TOO_LARGE" });
        return stop(1);
      }
      for (let end; (end = buffer.indexOf(10)) >= 0;) {
        const line = buffer.subarray(0, end);
        buffer = buffer.subarray(end + 1);
        if (line.length > MAX_FRAME) {
          output({ type: "error", code: "FRAME_TOO_LARGE" });
          return stop(1);
        }
        let input;
        try {
          input = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(line),
          );
          if (
            !input ||
            typeof input !== "object" ||
            Array.isArray(input) ||
            typeof input.id !== "string" ||
            !/^[A-Za-z0-9_-]{1,64}$/.test(input.id)
          )
            throw Error();
        } catch {
          output({ type: "error", code: "INVALID_REQUEST" });
          continue;
        }
        if (busy) {
          output({ type: "error", id: input.id, code: "BUSY" });
          continue;
        }
        busy = true;
        void (async () => {
          try {
            if (input.op === "pair")
              output({
                ...(await client.authenticate(input.code)),
                id: input.id,
              });
            else if (input.op === "close") stop();
            else if (
              (input.op === undefined || input.op === "command") &&
              typeof input.command === "string"
            )
              output(await client.command(input.command, input.id));
            else
              output({ type: "error", id: input.id, code: "INVALID_REQUEST" });
          } catch {
            output({ type: "error", id: input.id, code: "CONNECTION_FAILED" });
          } finally {
            busy = false;
          }
        })();
      }
      if (buffer.length > MAX_FRAME) {
        output({ type: "error", code: "FRAME_TOO_LARGE" });
        stop(1);
      }
    });
    process.stdin.once("end", () => {
      if (buffer.length) output({ type: "error", code: "INCOMPLETE_FRAME" });
      stop();
    });
    process.stdin.resume();
  })().catch(() => {
    console.error(
      "Unable to connect. Check the app, endpoint path and private connector identity.",
    );
    stop(1);
  });
}
module.exports = { runConnector };
if (require.main === module) runConnector();
