/** Country/province hints cannot partition city-level queue identity. This does
 * not manufacture a city; independently inferred local evidence may supply it. */
export function cityGranularityHint(value: unknown): string | undefined {
  const hint = String(value || '').trim();
  const key = hint.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
  return !hint || /^(?:canada|ca|can|united states(?: of america)?|usa|us|prince edward island|pei|pe|nova scotia|ns|new brunswick|nb|ontario|on)$/.test(key)
    ? undefined : hint;
}
