import { normalizeVenueName } from '../utils/similarity.js';

export type VenueAliasEntry = {
  alias: string;
  canonical: string;
  isSubVenue?: boolean;
  note?: string;
};

// Keep this list small and explicit. Add/remove entries as needed.
export const VENUE_ALIAS_RULESET_VERSION = '2026-04-13-maclauchlan-arena-a';

const VENUE_ALIASES: VenueAliasEntry[] = [
  {
    alias: 'Confederation Court Mall',
    canonical: 'The Confederation Court Mall',
    note: 'Mall venue only (not individual tenants).',
  },
  {
    alias: 'Confederation Centre',
    canonical: 'Confederation Centre of the Arts',
  },
  {
    alias: 'Sobey Family Theatre',
    canonical: 'Confederation Centre of the Arts',
    isSubVenue: true,
    note: 'Performance venue inside Confederation Centre of the Arts.',
  },
  {
    alias: 'Charlottetown Learning Library',
    canonical: 'Charlottetown Library Learning',
  },
  {
    alias: "Hunter's Ale House",
    canonical: "Hunter's Ale House | Charlottetown PE",
  },
  {
    alias: 'Hunters Ale House',
    canonical: "Hunter's Ale House | Charlottetown PE",
  },
  {
    alias: 'Souris Show Hall',
    canonical: 'Souris Show Hall | Souris PE',
  },
  {
    alias: 'Brackley Commons',
    canonical: 'Brackley Community Centre',
    note: 'Common shorthand/name variant for Brackley Community Centre.',
  },
  {
    alias: "St. Paul's Church",
    canonical: "St. Paul's Anglican Church",
    note: 'Common shorthand for St. Paul’s Anglican Church in Charlottetown.',
  },
  {
    alias: 'St Pauls Church',
    canonical: "St. Paul's Anglican Church",
    note: 'Punctuation-free shorthand for St. Paul’s Anglican Church.',
  },
  {
    alias: 'BAC',
    canonical: 'Bell Aliant Centre',
  },
  {
    alias: 'MacLauchlan Arena B',
    canonical: 'Bell Aliant Centre',
    isSubVenue: true,
    note: 'Arena inside Bell Aliant Centre.',
  },
  {
    alias: 'MacLauchlan Arena A',
    canonical: 'Bell Aliant Centre',
    isSubVenue: true,
    note: 'Arena inside Bell Aliant Centre.',
  },
  {
    alias: 'MacLauchlan Arena',
    canonical: 'Bell Aliant Centre',
    isSubVenue: true,
    note: 'Arena inside Bell Aliant Centre.',
  },
  // Founders Food Hall aliases
  {
    alias: "Founders' Hall",
    canonical: "Founders' Food Hall and Market",
  },
  {
    alias: 'Founders Hall',
    canonical: "Founders' Food Hall and Market",
  },
  // John Brown's aliases
  {
    alias: "John Brown's",
    canonical: 'John Brown Richmond St Grille',
  },
  {
    alias: 'John Browns',
    canonical: 'John Brown Richmond St Grille',
  },
  // Port Charlottetown / Charlottetown Seaport alias
  {
    alias: 'Charlottetown Seaport',
    canonical: 'Port Charlottetown',
  },
  {
    alias: "O'Brien's Social Bar & Kitchen",
    canonical: 'Red Shores',
    isSubVenue: true,
    note: 'Restaurant/bar inside Red Shores Charlottetown.',
  },
  {
    alias: "O'Brien's Social Bar & Kitchen (Red Shores Charlottetown)",
    canonical: 'Red Shores',
    isSubVenue: true,
    note: 'Restaurant/bar inside Red Shores Charlottetown.',
  },
  // Salvador Dali Cafe aliases (DB: "The Salvador Dali Café | Charlottetown PE")
  {
    alias: 'Dali Cafe',
    canonical: 'The Salvador Dali Café',
  },
  {
    alias: 'Dali Café',
    canonical: 'The Salvador Dali Café',
  },
  {
    alias: 'Salvador Dali Cafe',
    canonical: 'The Salvador Dali Café',
  },
  // Slaymaker & Nichols alias (DB: "Slaymaker & Nichols Gastro House")
  {
    alias: 'Slaymaker & Nichols',
    canonical: 'Slaymaker & Nichols Gastro House',
  },
  {
    alias: 'Slaymaker and Nichols',
    canonical: 'Slaymaker & Nichols Gastro House',
  },
  // UPEISU / W.A. Murphy Student Centre aliases
  {
    alias: 'W.A. Murphy Student Centre',
    canonical: 'UPEISU | Charlottetown PE',
    isSubVenue: true,
    note: 'W.A. Murphy Student Centre is the UPEISU building on UPEI campus.',
  },
  {
    alias: 'W.A Murphy Student Centre',
    canonical: 'UPEISU | Charlottetown PE',
    isSubVenue: true,
    note: 'Punctuation variant for W.A. Murphy Student Centre.',
  },
  {
    alias: 'W.A. Murphy Student Center',
    canonical: 'UPEISU | Charlottetown PE',
    isSubVenue: true,
    note: 'US spelling variant for W.A. Murphy Student Centre.',
  },
  {
    alias: 'W.A. Murphy Student Centre Hallway',
    canonical: 'UPEISU | Charlottetown PE',
    isSubVenue: true,
    note: 'Sub-location within W.A. Murphy Student Centre.',
  },
  {
    alias: 'W.A. Murphy Student Centre Hallway (concourse)',
    canonical: 'UPEISU | Charlottetown PE',
    isSubVenue: true,
    note: 'Sub-location within W.A. Murphy Student Centre.',
  },
  {
    alias: 'McMillan Hall, W.A. Murphy Student Centre',
    canonical: 'UPEISU | Charlottetown PE',
    isSubVenue: true,
    note: 'Common room/location label for UPEISU-hosted events.',
  },
];

const ALIAS_MAP = new Map<string, VenueAliasEntry>();
for (const entry of VENUE_ALIASES) {
  ALIAS_MAP.set(normalizeVenueName(entry.alias), entry);
}

export function getVenueAliasCandidates(name: string): string[] {
  const normalized = normalizeVenueName(name || '');
  if (!normalized) return [];
  const entry = ALIAS_MAP.get(normalized);
  if (!entry) return [];
  return [entry.canonical];
}

export function getVenueAliasEntry(name: string): VenueAliasEntry | null {
  const normalized = normalizeVenueName(name || '');
  if (!normalized) return null;
  return ALIAS_MAP.get(normalized) || null;
}

export function listVenueAliases(): VenueAliasEntry[] {
  return [...VENUE_ALIASES];
}
