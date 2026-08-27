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

Inspect `import-reports/import-dry-run.json`. It reports missing/unreferenced media, duplicate rows and filenames, photos with and without EXIF GPS, independent route GPS totals, invalid annotations and stopovers. Photo coordinates are never inferred from route timestamps.

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
