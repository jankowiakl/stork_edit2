# Stork Photo Journey and Editor

Public White Stork photo/GPS viewer with a protected scientific annotation workspace. The frontend is hosted by GitHub Pages; photographs, GPS data, users and descriptions live on the owner’s server.

## Included

- unchanged public map/photo viewer with lazy image loading;
- server-backed photographs, GPS routes and stopovers;
- photo positions prefer embedded EXIF geotags and otherwise use the nearest route point matched from the UTC timestamp in the filename;
- browser-persisted interface font scaling from 100% to 160%, with 160% as the first-use default;
- a translucent Sieweczka-inspired left navigation drawer with role-aware tiles, hover auto-hide and a slim edge handle;
- separate account/login, application-options, export and administrator workspaces instead of mixing account controls into map settings;
- three-column desktop editor: map / form / photo;
- synchronized photo navigation, a compact-by-default editor header and visible photo time/coordinates;
- draggable map/photo divider in normal browsing as well as draggable map/form/photo dividers in editing;
- persistent desktop/mobile Map / Form / Photo editor tabs with animated mobile transitions;
- field help, conditional controls and missing-value indicators;
- automatic draft saving during photo navigation, one active draft per user, completed records and optimistic version locking;
- next-unannotated navigation, copying values from the previous photo and required environment descriptions;
- per-user server-side Best pictures opened inside the complete map/photo viewer, a clickable Top rated ranking table and removable 1–5 star ratings;
- user verification requests and category proposals moderated by coordinators/administrators;
- table view with search, filters, paging, the current user's records first and permission-aware form editing;
- full-width data-browser table with every photo/annotation field, horizontal scrolling, date/category filters and persistent column visibility, order and widths;
- progress per individual and navigation to unfinished records;
- XLSX, CSV, JSON, GeoJSON, KML and optional photo ZIP exports;
- administrator, coordinator and annotator roles;
- SMTP invitations with a prepared Gmail fallback, role/permission descriptions, password reset, invitation/last-login status and per-individual edit access;
- PostgreSQL audit log and annotation history;
- administrator-only, dry-run-first browser import of XLSX/CSV/TXT, photos/ZIP, GPS and stopovers;
- import history showing who added what and when;
- secure administrator password recovery with the private server bootstrap token.
- installable mobile PWA with a manifest, stork icons, service-worker updates and in-application Android/iPhone instructions.
- backend-enforced private media access: signed photo-specific URLs, no anonymous thumbnails/full images and a restricted-contributor allowance that cannot be bypassed with filters or direct IDs;
- five contribution levels, completed/verified counters, milestone dates, Best pictures/full-access unlocks, private progress boxes and administrator-only contributor statistics;
- administrator-configurable global thresholds and per-user overrides, plus annotation tasks and verification requests linked directly from the user's account.

Completed records require an environment description except when `Fly_ground=fly`. Verification requests accept a schema key, database column, visible field label or a short custom subject, so a user can request review of e.g. a species without receiving `invalid_review_field`.

## Storage model

Photographs remain ordinary files under `photo-data/`. A `photos` row is the parent of its annotation and annotation history. Deleting a photo as an administrator therefore removes its description/history and physical file, while the independent `gps_points` route and `stopovers` map layers are preserved. PostgreSQL also stores users and access rules. The browser never stores a shared editor secret; each editor uses an individual account and a server-issued token.

## Administrator data workflow

GitHub stores only the application code. Scientific data is managed by an administrator in **Table → Import data** and remains on the QNAP: PostgreSQL stores individuals, photo records, annotations, GPS and stopovers, while `photo-data/` stores the image files.

Each browser import has two explicit stages. **Analyse files** uploads to temporary staging and produces a report of new records, existing records, duplicates, missing media, empty values that can be filled and edited annotations that will be preserved. It does not change the scientific tables. Only **Run import**, shown after that report, applies the batch. Description tables may be XLSX, comma/semicolon CSV or tab-delimited TXT. The administrator chooses which recognized columns may be imported; `Bird` and `FileName` always identify the photo. A row with `Analysed=yes` is imported as complete; `Analysed=no` remains unstarted. Imports fill null fields in `unstarted` placeholders but do not overwrite existing values or draft/reviewed/completed annotations. Every preview, completed batch, failure and cancellation is recorded in import history with the administrator and timestamp.

All XLSX/CSV/TXT text cells are sanitized by removing only the invisible NUL character (`U+0000`). The dry-run report records every removal as `nul_characters_removed` with `sourceRow` and `field`; ordinary characters, including Polish letters, are unchanged. Annotation values are sanitized again immediately before PostgreSQL writes.

Composite `Bird + FileName` keys use NUL only inside process-local maps. Reports use the safe `Bird | FileName` representation and separate `bird` / `filename` fields. Every import issue is deep-sanitized again before both `source_key` and `details` JSONB are inserted. Run the PostgreSQL duplicate-row integration test against an isolated test database with `TEST_DATABASE_URL=... npm run test:integration`.

On desktop, annotation mode keeps the map on the left, the form in the centre and gives the photograph the largest pane on the right. Drag either blue divider to resize adjacent panes; the proportions are saved in the browser. Double-click a divider to restore the default 18% / 30% / 52% proportions. Each `?` button opens the complete data type, unit, source/role and definition copied from the workbook's `info` sheet.

The height section is open by default. GPS altitude and editable height above ground determine ground elevation (`GPS altitude - above ground`). The preliminary 100-m class uses 0 through 50 m as class 0, then 100-m classes above each 50-m boundary; users may replace that preliminary class with another non-negative multiple of 100. `Fly_ground=ground` always forces height above ground and height class to 0.

Extensible categorical selectors offer **Add new category…**. A normal user must explain the reason; the value is temporary for that record until an administrator approves, rejects, renames or merges it. Rejected/deleted values are removed from affected annotations and completed records return to verification. Binary/control fields remain closed lists to preserve editor rules.

The route and stopovers remain independent map data. Photo positioning uses this priority: image EXIF geotag; nearest route point within `PHOTO_GPS_MAX_OFFSET_MINUTES` (90 minutes by default) using the UTC timestamp parsed from the filename; imported latitude/longitude as a final round-trip fallback. Reimporting the same `Bird + FileName` never creates a duplicate. If the stored image has no EXIF position and the reimported version has one, the file and metadata are upgraded while its existing annotation remains attached to the same photo row.

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
