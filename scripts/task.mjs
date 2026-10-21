import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
process.env.NODE_OPTIONS =
  `${process.env.NODE_OPTIONS || ""} --max-old-space-size=2048`.trim();
if (process.platform === "linux" && !process.env.UI_TERMINAL_BUILD_LOCKED) {
  const directory = path.join(homedir(), ".cache/faypos");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const ranges = /Cpus_allowed_list:\s*(.+)/.exec(
    readFileSync("/proc/self/status", "utf8"),
  )[1];
  const cpus = [];
  for (const range of ranges.split(",")) {
    const [start, end = start] = range.split("-").map(Number);
    for (let n = start; n <= end && cpus.length < 2; n++) cpus.push(n);
  }
  const result = spawnSync(
    "flock",
    [
      "--exclusive",
      "--no-fork",
      path.join(directory, "native-build.lock"),
      "nice",
      "-n",
      "10",
      "ionice",
      "-c",
      "3",
      "taskset",
      "-c",
      cpus.join(","),
      process.execPath,
      ...process.argv.slice(1),
    ],
    {
      stdio: "inherit",
      env: { ...process.env, UI_TERMINAL_BUILD_LOCKED: "1" },
    },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
function run(args) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const tsc = "node_modules/typescript/bin/tsc";
run([tsc, "-p", "tsconfig.json"]);
const task = process.argv[2];
if (task === "test")
  run(["--test", "--test-concurrency=1", "tests/core.test.mjs", "tests/local.test.cjs"]);
else if (task === "browser")
  run(["node_modules/@playwright/test/cli.js", "test"]);
else if (task === "package") run(["scripts/package-smoke.mjs"]);
else if (task === "build") {
  run([tsc, "-p", "tsconfig.check.json"]);
  run(["node_modules/vite/bin/vite.js", "build"]);
} else if (task !== "library") throw new Error("Unknown task");
