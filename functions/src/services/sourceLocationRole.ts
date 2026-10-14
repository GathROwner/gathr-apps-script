/** An original-business review carries its own source identity. Its sharing
 * page's address must never be hydrated back from the outer spreadsheet row. */
export function allowsPublisherAddressHydration(sample: {sourceLocationRole?: string}): boolean {
  return sample.sourceLocationRole !== 'shared_original_business';
}
