/** An original-business review carries its own source identity. Its sharing
 * page's address must never be hydrated back from the outer spreadsheet row. */
export function allowsPublisherAddressHydration(sample: {sourceLocationRole?: string}): boolean {
  return !['shared_original_business', 'collection_partner_only'].includes(sample.sourceLocationRole || '');
}
