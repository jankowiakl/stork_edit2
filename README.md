# Stork Photo Journey and Editor

Public White Stork photo/GPS viewer with a protected scientific annotation workspace. The frontend is hosted by GitHub Pages; photographs, GPS data, users and descriptions live on the owner’s server.

## Included

- unchanged public map/photo viewer with lazy image loading;
- server-backed photographs, GPS routes and stopovers;
- photo positions read exclusively from embedded EXIF geotags, never inferred from route time;
- browser-persisted interface font scaling from 100% to 160%;
- three-column desktop editor: map / form / photo;
- mobile Map / Form / Photo editor tabs;
- field help, conditional controls and missing-value indicators;
- drafts, completed records and optimistic version locking;
- table view with search, filters, paging and direct editing;
- progress per individual and navigation to unfinished records;
- XLSX, CSV, JSON, GeoJSON, KML and optional photo ZIP exports;
- administrator, coordinator and annotator roles;
- invitations, password reset and per-individual access;
- PostgreSQL audit log and annotation history;
- administrator-only, dry-run-first browser import of XLSX, photos/ZIP, GPS and stopovers;
- import history showing who added what and when;
- secure administrator password recovery with the private server bootstrap token.

## Storage model

Photographs remain ordinary files under `photo-data/`. PostgreSQL stores metadata, GPS, annotations, user access and revision history. The browser never stores a shared editor secret; each editor uses an individual account and a server-issued token.

## Administrator data workflow

GitHub stores only the application code. Scientific data is managed by an administrator in **Table → Import data** and remains on the QNAP: PostgreSQL stores individuals, photo records, annotations, GPS and stopovers, while `photo-data/` stores the image files.

Each browser import has two explicit stages. **Analyse files** uploads to temporary staging and produces a report of new records, existing records, duplicates, missing media, empty placeholders that will be filled and edited annotations that will be preserved. It does not change the scientific tables. Only **Run import**, shown after that report, applies the batch. A `photos`-sheet row with `Analysed=yes` is imported as complete; `Analysed=no` remains unstarted. Excel may fill an empty `unstarted` placeholder created by an earlier photo-only import, but a genuinely edited annotation is never overwritten by the browser workflow. Every preview, completed batch, failure and cancellation is recorded in import history with the administrator and timestamp.

All XLSX text cells are sanitized by removing only the invisible NUL character (`U+0000`). The dry-run report records every removal as `nul_characters_removed` with `sourceRow` and `field`; ordinary characters, including Polish letters, are unchanged. Annotation values are sanitized again immediately before PostgreSQL writes.

The route GPS file and photo geotags are intentionally separate. A photo latitude/longitude is accepted only from that image's EXIF GPS block. Photos without a geotag are reported and are not positioned by matching their timestamp to the route.

## Repository layout

```text
index.html                 GitHub Pages frontend
config.js                  public API address
compose.yaml               PostgreSQL + API containers
api/src/schema.sql         SQL schema
api/src/server.js          API and media service
api/src/import-data.js     dry-run/apply migration tool
api/src/validation.js      annotation rules
api/test/                  rule tests
DEPLOYMENT.md              server and GitHub Pages setup
MIGRATION.md               data migration procedure
```

See [DEPLOYMENT.md](DEPLOYMENT.md) and [MIGRATION.md](MIGRATION.md).
