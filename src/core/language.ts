import type { Method } from "./types.js";
export class TerminalError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const methods = new Set<Method>([
  "click",
  "right_click",
  "hold",
  "long_press",
  "type",
  "clear",
  "focus",
  "unfocus",
  "press",
  "scroll",
]);
export type Query = {
  path?: string[];
  role?: string;
  find?: string;
  tree?: boolean;
  json?: boolean;
  limit?: number;
  offset?: number;
  mode: "screen" | "all" | "visible" | "navigation";
};
export type Command =
  | { kind: "help" }
  | { kind: "clear" }
  | { kind: "changes" }
  | { kind: "inspect"; query: Query }
  | {
      kind: "action";
      path: string[];
      method: Method;
      args: (string | number)[];
    };
export function parsePath(
  source: string,
  options: { allowNumericIndices?: boolean } = {},
): string[] {
  if (!source || source.length > 500)
    throw new TerminalError("PARSE_ERROR", "Use a discovered control path.");
  const parts: string[] = [];
  let rest = source;
  const first = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
  if (first) {
    parts.push(first[0]);
    rest = rest.slice(first[0].length);
  } else if (!rest.startsWith('["'))
    throw new TerminalError(
      "PARSE_ERROR",
      "Paths start with a control name or quoted ID.",
    );
  while (rest) {
    const identifier = /^\.([A-Za-z_][A-Za-z_0-9]*)/.exec(rest);
    const index = options.allowNumericIndices
      ? /^\[(0|[1-9][0-9]{0,4})\]/.exec(rest)
      : null;
    const key = /^\[("(?:[^"\\\x00-\x1f]|\\.)*")\]/.exec(rest);
    if (identifier) {
      parts.push(identifier[1]!);
      rest = rest.slice(identifier[0].length);
    } else if (key) {
      try {
        parts.push(JSON.parse(key[1]!) as string);
      } catch {
        throw new TerminalError(
          "PARSE_ERROR",
          "Quoted keys must use JSON strings.",
        );
      }
      rest = rest.slice(key[0].length);
    } else if (index) {
      parts.push(index[1]!);
      rest = rest.slice(index[0].length);
    } else
      throw new TerminalError(
        "PARSE_ERROR",
        'Use named controls or quoted item IDs, such as cart.items["line-1"].remove.',
      );
    if (parts.length > 24)
      throw new TerminalError("PARSE_ERROR", "Path is too deep.");
  }
  if (
    parts.some(
      (p) =>
        !p ||
        p.length > 160 ||
        ["__proto__", "constructor", "prototype"].includes(p),
    )
  )
    throw new TerminalError("PARSE_ERROR", "That path key is not allowed.");
  return parts;
}
export function formatPath(parts: readonly string[]) {
  return parts
    .map((part, i) =>
      /^[A-Za-z_][A-Za-z_0-9]*$/.test(part)
        ? (i ? "." : "") + part
        : `[${JSON.stringify(part)}]`,
    )
    .join("");
}
export function under(path: readonly string[], prefix: readonly string[]) {
  return prefix.every((value, index) => path[index] === value);
}
export function parse(
  source: string,
  options: { allowNumericIndices?: boolean } = {},
): Command {
  const line = source.trim();
  if (!line || line.length > 4096)
    throw new TerminalError(
      "PARSE_ERROR",
      "Enter one command, up to 4096 characters.",
    );
  if (line === "help" || line === "?") return { kind: "help" };
  if (line === "clear") return { kind: "clear" };
  if (line === "ls --changes") return { kind: "changes" };
  if (line === "ls") return { kind: "inspect", query: { mode: "screen" } };
  if (line.startsWith("ls ")) {
    const parts: string[] = [];
    let part = "",
      quoted = false,
      escape = false;
    for (const ch of line.slice(3).trim()) {
      if (/\s/.test(ch) && !quoted) {
        if (part) {
          parts.push(part);
          part = "";
        }
        continue;
      }
      part += ch;
      if (escape) escape = false;
      else if (ch === "\\" && quoted) escape = true;
      else if (ch === '"') quoted = !quoted;
    }
    if (quoted)
      throw new TerminalError(
        "PARSE_ERROR",
        "Close the quoted discovery argument.",
      );
    if (part) parts.push(part);
    const query: Query = { mode: "screen" };
    const seen = new Set<string>();
    for (let i = 0; i < parts.length; i++) {
      const token = parts[i]!;
      if (token.startsWith("--")) {
        if (seen.has(token))
          throw new TerminalError(
            "PARSE_ERROR",
            "Use each discovery option once.",
          );
        seen.add(token);
        if (token === "--tree") query.tree = true;
        else if (token === "--json") query.json = true;
        else if (["--all", "--visible"].includes(token)) {
          if (query.mode !== "screen")
            throw new TerminalError(
              "PARSE_ERROR",
              "Choose one discovery scope.",
            );
          query.mode = token === "--all" ? "all" : "visible";
        } else if (
          ["--role", "--find", "--limit", "--offset"].includes(token)
        ) {
          const value = parts[++i];
          if (!value || value.startsWith("--"))
            throw new TerminalError(
              "PARSE_ERROR",
              "Supply a discovery option value.",
            );
          if (token === "--role") {
            if (!/^[a-z][a-z_-]{0,39}$/.test(value))
              throw new TerminalError(
                "PARSE_ERROR",
                "Use a role such as readout, field, button or group.",
              );
            query.role = value;
          } else if (token === "--find") {
            let phrase = value;
            try {
              if (value.startsWith('"')) phrase = JSON.parse(value);
            } catch {
              throw new TerminalError(
                "PARSE_ERROR",
                "Use a JSON-quoted search phrase.",
              );
            }
            if (!phrase.trim() || phrase.length > 200)
              throw new TerminalError(
                "PARSE_ERROR",
                "Search uses 1 to 200 characters.",
              );
            query.find = phrase.toLowerCase();
          } else {
            if (
              !/^\d+$/.test(value) ||
              Number(value) > 10000 ||
              (token === "--limit" && Number(value) < 1)
            )
              throw new TerminalError(
                "PARSE_ERROR",
                "Use a limit of 1–10000 or offset of 0–10000.",
              );
            if (token === "--limit") query.limit = Number(value);
            else query.offset = Number(value);
          }
        } else
          throw new TerminalError(
            "PARSE_ERROR",
            "Unknown discovery option. Run help.",
          );
      } else {
        if (query.path)
          throw new TerminalError(
            "PARSE_ERROR",
            "Inspect one group at a time.",
          );
        query.path = parsePath(token, options);
        if (token === "navigation") query.mode = "navigation";
        else if (query.mode === "screen") query.mode = "all";
      }
    }
    return { kind: "inspect", query };
  }
  const call = /^(.*?)\.([a-z_]+)\(([\s\S]*)\)$/.exec(line);
  if (!call)
    return {
      kind: "inspect",
      query: { mode: "all", path: parsePath(line, options) },
    };
  const method = call[2] as Method;
  if (!methods.has(method))
    throw new TerminalError(
      "UNKNOWN_ACTION",
      "Unknown UI action. Run ls to discover supported actions.",
    );
  let args: unknown;
  try {
    args = JSON.parse(`[${call[3]}]`);
  } catch {
    throw new TerminalError(
      "INVALID_ARGUMENT",
      'Use JSON arguments, such as search.type("Coffee").',
    );
  }
  if (
    !Array.isArray(args) ||
    args.some((v) => !["string", "number"].includes(typeof v))
  )
    throw new TerminalError(
      "INVALID_ARGUMENT",
      "Only text and numeric arguments are supported.",
    );
  const count = ["type", "press", "scroll"].includes(method) ? 1 : 0;
  if (args.length !== count)
    throw new TerminalError(
      "INVALID_ARGUMENT",
      `${method} expects ${count} argument(s).`,
    );
  if (["type", "press"].includes(method) && typeof args[0] !== "string")
    throw new TerminalError("INVALID_ARGUMENT", "Use one quoted string.");
  if (method === "press" && args[0] !== "Enter")
    throw new TerminalError(
      "INVALID_ARGUMENT",
      'This version supports press("Enter").',
    );
  if (
    method === "scroll" &&
    (typeof args[0] !== "number" ||
      !Number.isFinite(args[0]) ||
      Math.abs(args[0]) > 4000)
  )
    throw new TerminalError(
      "INVALID_ARGUMENT",
      "Scroll distance must be a number between -4000 and 4000.",
    );
  return {
    kind: "action",
    path: parsePath(call[1]!, options),
    method,
    args: args as (string | number)[],
  };
}
export const HELP = [
  'ls · ls cart · ls navigation · ls --all · ls --visible · ls --changes · ls --tree · ls --role readout · ls --find "stock" · ls --limit 20 --offset 0',
  'search.type("Coffee") · search.press("Enter")',
  'cart.items["line-1"].remove.click() · settings.click()',
  'Use .click(), .right_click(), .hold(), .type("text"), .clear(), .focus(), .unfocus(), .press("Enter"), .scroll(250) when listed.',
  "type replaces text. hold invokes one supported long-press action. This is not JavaScript or a shell.",
  "Dispatched means the UI received an action; only an explicit host receipt confirms a save.",
].join("\n");
