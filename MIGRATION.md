# Migration of photos, Excel/Google Sheets and GPS data

The importer is dry-run-first. Without `--apply` it creates a report but does not change PostgreSQL or copy photographs. The original workbook is never modified.

For normal operation, prefer the administrator browser workflow in **Table → Import data**. It uses the same dry-run/apply rules, preserves existing annotations and records import history. The commands below remain useful for the initial server migration and automation.

## 1. Prepare files

Place them on the server as:

```text
stork_edit2/app/import-data/
  storks_photos_dane.xlsx
  data_clear30m.txt
  data_residence_all_buffors1km_25km_residence.gpkg
  photos/
```

Download Google Sheets using **File → Download → Microsoft Excel (.xlsx)**. The importer reads the main `photos` tab. `photos_update` is not imported separately because it duplicates unfinished rows already present in `photos`.

Copy current photos into `import-data/photos` using File Station, SFTP, `rsync`, or:

```sh
git clone --depth 1 https://github.com/jankowiakl/stork-log-photos.git import-data/photos
```

Subfolders are supported. Each matched image is checked with SHA-256 and stored as `photo-data/<Bird>/<FileName>`.

## 2. Dry run

```sh
docker compose run --rm api npm run import -- \
  --workbook /imports/storks_photos_dane.xlsx \
  --photos /imports/photos \
  --gps /imports/data_clear30m.txt \
  --stopovers /imports/data_residence_all_buffors1km_25km_residence.gpkg \
  --report /reports/import-dry-run.json
```

Inspect `import-reports/import-dry-run.json`. It reports missing/unreferenced media, duplicate rows and filenames, photos with and without EXIF GPS, positions matched to route time, independent route GPS totals, invalid annotations and stopovers. EXIF has priority; only a photo without EXIF GPS can use the nearest route point within `PHOTO_GPS_MAX_OFFSET_MINUTES`.

The inspected workbook contains 3176 source rows and 3175 unique `Bird + FileName` records. The duplicate remains visible in the report and audit log; the photo itself is imported once. Starting counts are 657 analysed and 2519 unfinished source rows.

## 3. Apply only after reviewing the report

```sh
docker compose run --rm api npm run import -- \
  --workbook /imports/storks_photos_dane.xlsx \
  --photos /imports/photos \
  --gps /imports/data_clear30m.txt \
  --stopovers /imports/data_residence_all_buffors1km_25km_residence.gpkg \
  --report /reports/import-applied.json \
  --apply
```

Existing annotations are not overwritten. Only an intentional replacement should add `--replace-annotations`.

## 4. Verify

1. Compare totals in **Progress** with the report.
2. Open one completed and one unfinished record.
3. Test **Save draft**, **Save analysed** and **Save & next**.
4. Export XLSX.
5. Verify one photo and the full overview route for each individual.

After verification, SQL becomes the source of truth. Keep the old Google Sheet as a read-only historical copy instead of editing two databases in parallel.

## Contribution access migration

The API runs `schema.sql` at startup. This migration only adds columns with safe defaults and new tables; it does not delete or rewrite photos, GPS, stopovers, annotation values or history. Existing accounts remain standard accounts because `restricted_contributor` defaults to `false`.

## Photo Safe sharing

Photo Safe sharing adds two live-reference tables:

- `photo_safe_user_shares` for read-only access granted to another active account;
- `photo_safe_public_shares` for expiring public links.

Run the normal schema migration (`npm run migrate`, or restart the API when deployment already runs the migration at startup). The migration is additive. It does not copy or alter `user_photo_favorites`; every share resolves the owner's current favourites and `sort_order` when it is read.

Public link secrets are generated from 32 cryptographically random bytes. Only their SHA-256 hashes are stored in PostgreSQL. Revocation sets `revoked_at`; expiry is enforced with `expires_at > now()`. Shared media use separate short-lived signed URLs, and every media request still checks the active share and current membership of the photo in the owner's safe.

Optional central contact configuration for the public scientific-project dialog:

- `PROJECT_CONTACT_NAME`
- `PROJECT_CONTACT_EMAIL`
- `PROJECT_CONTACT_URL`

Existing complete annotations are attributed to their original `created_by`/`updated_by` user where possible. Future progress is calculated from the current annotation state, so moving a record from `complete` to `needs_review` immediately removes it from completed and verified counters. Administrators can enable restricted mode per user after deployment and configure global or per-user limits in **Contributors**.

`user_photo_access` remains as an access-history table. Active ordinary browsing access is now stored separately in `user_browse_cycle_state` and `user_browse_cycle_photos`. Each restricted user has one active `cycle_no`; only unique ordinary photos recorded for that number count against `initial_browsing_allowance`. Reopening a current-cycle photo does not consume another slot. Completing one new annotation atomically advances `cycle_no`, begins a fresh allowance and invalidates ordinary grants from the previous cycle without deleting their history. Photos completed by that same user, active annotation focus photos and explicit tasks remain accessible without consuming the cycle.

The migration adds `browse_cycle_no` and `browse_cycle_started_at` to `contribution_stats`, plus the two cycle tables above. It does not delete or rewrite `user_photo_access`, photos, annotations, GPS or stopovers. Existing users receive cycle 1 lazily on first access. Media URLs remain short-lived and bound to one user and one photo; every full-image, preview and download request rechecks the active backend grant, so a cached token or direct ID cannot restore a previous-cycle photo.

The legacy `photos_per_completed` setting is retained in PostgreSQL and API normalization for backward-compatible deployments, but it no longer participates in media authorization and is no longer shown in the administrator interface. `initial_browsing_allowance` is now the complete size of every renewed browsing cycle.

At an exhausted browsing limit, `restricted_annotation_focus` keeps a server-controlled set of at most five unfinished, editable photos with usable map locations available from **Start annotating**. The implementation does not expose this as a separate queue feature. Repeating the request, changing `after`, moving through the editor or editing a direct URL cannot expand that set. A successful new `complete` clears the focus set as it starts the next browsing cycle. Existing single-photo focus rows are migrated safely to the composite `(user_id, photo_id)` key. The Scientific Contributor default threshold is 2000 completed annotations; startup migration updates unchanged 1000-value defaults and overrides to 2000.
