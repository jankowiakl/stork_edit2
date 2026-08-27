# Deployment on the QNAP/server

This stack is separate from Sieweczka and from the older `stork_edit` work. It has its own PostgreSQL database, API container and repository.

## 1. Download the new repository

```sh
mkdir -p /share/CACHEDEV1_DATA/stork_edit2
cd /share/CACHEDEV1_DATA/stork_edit2
git clone https://github.com/jankowiakl/stork_edit2.git app
cd app
cp .env.example .env
```

## 2. Configure `.env`

Replace at least:

- `POSTGRES_PASSWORD` and the same password inside `DATABASE_URL`;
- `JWT_SECRET` with at least 48 random characters;
- `BOOTSTRAP_TOKEN` with a different random string of at least 24 characters;
- `PUBLIC_API_URL` with the final HTTPS address of the API;
- `MAX_IMPORT_FILE_MB` and `MAX_IMPORT_ENTRIES` if an archive may exceed the defaults;
- SMTP values if invitations should be emailed automatically.

Generate secrets on the server:

```sh
openssl rand -hex 32
openssl rand -hex 24
```

Do not commit `.env`.

## 3. Start the database and API

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api
```

PostgreSQL is not exposed publicly. The API listens on `127.0.0.1:18444`; expose it through the QNAP reverse proxy with HTTPS.

Example:

```text
https://bielik.myqnapcloud.com:18444  →  http://127.0.0.1:18444
```

Verify:

```sh
curl https://bielik.myqnapcloud.com:18444/health
```

The response must contain `"ok":true`.

For large browser imports, set the QNAP reverse proxy request-body limit and timeout high enough for the largest ZIP, then rebuild the API. The API default permits one import file up to 4096 MB and up to 10,000 ZIP entries.

## 4. Create the first administrator

This endpoint works only while the users table is empty and requires the private `BOOTSTRAP_TOKEN` from `.env`:

```sh
curl -X POST https://bielik.myqnapcloud.com:18444/api/bootstrap-admin \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Token: YOUR_BOOTSTRAP_TOKEN" \
  -d '{"email":"YOUR_EMAIL","name":"Łukasz Jankowiak","password":"A_LONG_UNIQUE_PASSWORD"}'
```

Further accounts are managed inside **Table → Users**. Temporary passwords must be changed at first login.

If the first administrator exists but its password is unknown, open **Settings → Editor account → Cannot log in?**. Enter the administrator email, a new password and the current `BOOTSTRAP_TOKEN` from the server `.env`. The token is checked only by the API over HTTPS and is not saved in the browser. You can also recover from the server shell:

```sh
curl -X POST https://bielik.myqnapcloud.com:18444/api/recover-admin \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL","bootstrapToken":"YOUR_BOOTSTRAP_TOKEN","newPassword":"A_NEW_LONG_UNIQUE_PASSWORD"}'
```

After recovery, log in normally. Repeated failed login or recovery attempts are limited for 15 minutes.

## 5. Configure and enable GitHub Pages

Check `config.js`; `apiBase` must point to the HTTPS API. Then in `jankowiakl/stork_edit2` open **Settings → Pages**, select **Deploy from a branch**, branch `main`, folder `/ (root)`.

The frontend address will be:

```text
https://jankowiakl.github.io/stork_edit2/
```

No password, database credential or API secret belongs in `config.js`.

## Roles

- **admin** — all individuals, users, roles, exports and editing;
- **coordinator** — all individuals, progress, editing and exports;
- **annotator** — only individuals explicitly assigned by an administrator;
- **public visitor** — current map/photo viewer only.

## Backups

Back up both SQL and photographs:

```sh
mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backups/stork_edit_$(date +%F).sql"
tar -czf "backups/stork_photos_$(date +%F).tar.gz" photo-data
```

## Browser imports

An administrator opens **Table → Import data** and may upload any combination of:

- photographs as files, a folder or a ZIP; photo-only folders use `Bird/FileName` paths;
- `data_clear30m.txt` (or a later file with the same columns);
- stopovers as `.gpkg` or GeoJSON;
- descriptive/completed records as `.xlsx` with a `photos` sheet.

The administrator must first review the dry-run report. **Run import** appears only after that report. SHA-256 and database uniqueness prevent duplicate photos and GPS points; stable geometry/property hashes prevent duplicate stopovers. `Analysed=yes` in the `photos` worksheet marks a record complete. An empty `unstarted` placeholder may be filled from Excel, while annotations containing user-entered data are preserved. The history identifies the administrator, time, sources and result of every batch.

The XLSX reader removes only NUL (`U+0000`) from text values and reports the affected source row and field during dry run. A second sanitization runs directly before annotation values are sent to PostgreSQL.

Photo coordinates come only from JPEG/PNG/WebP EXIF geotags. `data_clear30m.txt` supplies the independent route layer and is never used to infer a missing photo position from its timestamp. The report lists photos with and without EXIF GPS separately.

The interface defaults to 125% typography. Each browser can change this under **Settings → Interface font size** (100–160%); the choice is saved locally.

## Updating

```sh
git pull --ff-only
docker compose up -d --build
curl https://bielik.myqnapcloud.com:18444/health
```
