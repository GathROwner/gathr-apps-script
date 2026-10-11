/** Keep source text and ordered images outside the reusable classification rules. */
export function stage2CachedTextBlocks(text: string): Array<{
  type: 'input_text';
  text: string;
  prompt_cache_breakpoint?: { mode: 'explicit' };
}> | null {
  const intro = 'Classify this validated content into ONE of these categories:\n\n';
  const categories = '\n\nCLASSIFICATION CATEGORIES:\n';
  const schema = '\n\nReturn ONLY valid JSON that matches this schema:\n';
  if (!text.startsWith(intro + 'CONTENT:\n')) return null;
  const end = text.lastIndexOf(categories);
  const schemaAt = text.lastIndexOf(schema);
  if (end <= intro.length || schemaAt <= end) return null;
  try { JSON.parse(text.slice(schemaAt + schema.length)); } catch { return null; }
  const stable = (text.slice(0, intro.length) + text.slice(end + 2))
    .replace('FACEBOOK EVENT DATA is present above', 'FACEBOOK EVENT DATA is present in CONTENT');
  return [
    { type: 'input_text', text: stable, prompt_cache_breakpoint: { mode: 'explicit' } },
    { type: 'input_text', text: text.slice(intro.length, end + 2) },
  ];
}
