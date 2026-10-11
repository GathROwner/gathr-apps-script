/** Keep source fields after a reusable formatting prefix. Unknown prompt shapes
 * retain the original request instead of risking lost rules or source content. */
export function stage5CachedTextBlocks(prompt: string, userName: string): Array<{
  type: 'input_text';
  text: string;
  prompt_cache_breakpoint?: { mode: 'explicit' };
}> | null {
  if (!userName.trim() || /[\r\n]/.test(userName)) return null;
  let stable = prompt;
  const dynamic: string[] = [];
  const move = (start: string, end: string): boolean => {
    const from = stable.indexOf(start);
    const to = stable.indexOf(end, from + start.length);
    if (from < 0 || to <= from) return false;
    dynamic.push(stable.slice(from, to));
    stable = stable.slice(0, from) + stable.slice(to);
    return true;
  };
  if (!move('BATCH COUNT ENFORCEMENT:', 'Format these validated items') ||
      !move('CONTEXT:\n', 'CRITICAL VENUE PRESERVATION:') ||
      !move('ITEMS TO FORMAT:\n', 'CRITICAL CATEGORIZATION INSTRUCTION:')) return null;
  try {
    const items = JSON.parse(dynamic[2].slice('ITEMS TO FORMAT:\n'.length));
    if (!Array.isArray(items)) return null;
  } catch { return null; }
  const venueRules = stable.split('\n').filter(line => line.includes(userName));
  for (const line of venueRules) {
    dynamic.push(line);
    stable = stable.replace(line, '');
  }
  return [
    { type: 'input_text', text: stable, prompt_cache_breakpoint: { mode: 'explicit' } },
    { type: 'input_text', text: dynamic.join('\n') },
  ];
}
