/** Preserve the tested Stage 1 wording while caching only reusable instructions.
 * Unknown layouts retain the original request, so cache optimization cannot
 * turn prompt drift into a source-processing failure.
 */
export function stage1CachedTextBlocks(text: string): Array<{
  type: 'input_text';
  text: string;
  prompt_cache_breakpoint?: { mode: 'explicit' };
}> | null {
  const schemaMarker = '\n\nReturn ONLY valid JSON that matches this schema:\n';
  const schemaAt = text.lastIndexOf(schemaMarker);
  const postAt = text.indexOf('POST DETAILS:\n');
  if (postAt <= 0 || schemaAt <= postAt) return null;
  const rules = text.slice(0, postAt);
  const counts = rules.match(/^- ATTACHED IMAGE COUNT: .*$/gm);
  if (counts?.length !== 1 || !rules.includes(counts[0] + '\n')) return null;
  return [
    {
      type: 'input_text',
      text: rules.replace(counts[0] + '\n', '') + text.slice(schemaAt),
      prompt_cache_breakpoint: { mode: 'explicit' },
    },
    {
      type: 'input_text',
      text: counts[0] + '\n\n' + text.slice(postAt, schemaAt),
    },
  ];
}
