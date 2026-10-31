# PEI pilot OpenStreetMap-derived catalogue

© OpenStreetMap contributors — https://www.openstreetmap.org/copyright
Database licensed under ODbL1.0: https://opendatacommons.org/licenses/odbl/1-0/

Source: official Geofabrik Prince Edward Island regional OSM PBF and extract
polygon. Exact source timestamp, URLs and checksums are in the catalogue
manifest. This is a filtered, independently distributed OSM-derived database;
it contains no GathR proprietary venue records, user locations or authorizations.

The complete derived database is `pei-osm-catalogue.json`, distributed with this
notice and its checksum. Reproduction is supplied in
`functions/scripts/build-pei-osm-catalogue.py`; pyosmium4.3.2 is BSD-2-Clause.
Retain this notice, OSM attribution and ODbL terms when redistributing the data.
The public-data offer for a Production release must host this exact derived
database or an ODbL-compliant reproducible alterations package; local POC
artifacts provide that package for review but are not a published hosting offer.

Coverage is the manifest extract polygon, with full175m-circle containment.
Freshness is the OSM replication timestamp, not the file download date. The
local POC maximum age is7days, pending a production refresh/maintenance decision.
Relation geometry uses the existing center-pin policy: the center of complete
recursive member bounds, never a fabricated multipolygon footprint. Complete
supported closed-way geometry is retained. Missing or unbounded required
references abort import. Any bounded unsupported geometry is an explicit
coverage limitation; it cannot become successful empty preparation.
