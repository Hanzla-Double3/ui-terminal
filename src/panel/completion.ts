/** Use every match for completion, independently of the suggestion display limit. */
export function completePrefix(source: string, candidates: readonly string[]) {
  const matches = [...new Set(candidates)].filter((value) =>
    value.startsWith(source),
  );
  if (!matches.length) return { value: source, options: [], total: 0 };
  if (matches.length === 1)
    return { value: matches[0]!, options: matches, total: 1 };
  let common = matches[0]!;
  for (const match of matches.slice(1)) {
    let length = 0;
    while (length < common.length && common[length] === match[length]) length++;
    common = common.slice(0, length);
    if (common.length === source.length) break;
  }
  // Descend one common group at a time. Dots inside quoted IDs are not separators.
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < common.length; index++) {
    const character = common[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "." && index >= source.length) {
      common = common.slice(0, index + 1);
      break;
    }
  }
  return { value: common, options: matches.slice(0, 8), total: matches.length };
}
