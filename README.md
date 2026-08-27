# Stork Photo Journey and Editor

Public White Stork photo/GPS viewer with a protected scientific annotation workspace. The frontend is hosted by GitHub Pages; photographs, GPS data, users and descriptions live on the owner’s server.

## Included

- unchanged public map/photo viewer with lazy image loading;
- server-backed photographs, GPS routes and stopovers;
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
- dry-run-first migration of the current workbook, photos, GPS and stopovers.

## Storage model

Photographs remain ordinary files under `photo-data/`. PostgreSQL stores metadata, GPS, annotations, user access and revision history. The browser never stores a shared editor secret; each editor uses an individual account and a server-issued token.

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

