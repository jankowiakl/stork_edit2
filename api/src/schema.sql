CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','coordinator','annotator')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  invite_sent_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_contributor BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contribution_use_defaults BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Stable scientific attribution survives permanent deletion of a login account.
-- It deliberately contains no password, e-mail address or authentication state.
CREATE TABLE IF NOT EXISTS user_attributions (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role_snapshot TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  account_deleted_at TIMESTAMPTZ
);
INSERT INTO user_attributions(user_id,display_name,role_snapshot,first_seen_at,updated_at)
SELECT id,name,role,created_at,now() FROM users
ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,role_snapshot=EXCLUDED.role_snapshot,updated_at=now();
CREATE OR REPLACE FUNCTION sync_user_attribution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_attributions(user_id,display_name,role_snapshot,first_seen_at,updated_at,account_deleted_at)
  VALUES(NEW.id,NEW.name,NEW.role,COALESCE(NEW.created_at,now()),now(),NULL)
  ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,role_snapshot=EXCLUDED.role_snapshot,updated_at=now(),account_deleted_at=NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_user_attribution ON users;
CREATE TRIGGER trg_sync_user_attribution AFTER INSERT OR UPDATE OF name,role ON users FOR EACH ROW EXECUTE FUNCTION sync_user_attribution();
CREATE OR REPLACE FUNCTION mark_deleted_user_attribution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_attributions(user_id,display_name,role_snapshot,first_seen_at,updated_at,account_deleted_at)
  VALUES(OLD.id,OLD.name,OLD.role,COALESCE(OLD.created_at,now()),now(),now())
  ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,role_snapshot=EXCLUDED.role_snapshot,updated_at=now(),account_deleted_at=now();
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_mark_deleted_user_attribution ON users;
CREATE TRIGGER trg_mark_deleted_user_attribution BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION mark_deleted_user_attribution();

CREATE TABLE IF NOT EXISTS individuals (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  species TEXT NOT NULL DEFAULT 'Ciconia ciconia',
  ring TEXT,
  sex TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  public_visible BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_individual_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, individual_id)
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE RESTRICT,
  filename TEXT NOT NULL,
  capture_time TIMESTAMPTZ,
  storage_path TEXT,
  original_path TEXT,
  source_url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  media_status TEXT NOT NULL DEFAULT 'available' CHECK (media_status IN ('available','missing','quarantined')),
  address TEXT,
  country TEXT,
  close_city TEXT,
  geo_desc TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  gps_time TIMESTAMPTZ,
  location_source TEXT CHECK (location_source IS NULL OR location_source IN ('exif','track','import','missing')),
  exif_checked_at TIMESTAMPTZ,
  altitude_m DOUBLE PRECISION,
  elevation_m DOUBLE PRECISION,
  source_row INTEGER,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  public_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (individual_id, filename)
);
CREATE INDEX IF NOT EXISTS idx_photos_individual_time ON photos(individual_id, capture_time, filename);
CREATE INDEX IF NOT EXISTS idx_photos_filename ON photos(filename);
CREATE INDEX IF NOT EXISTS idx_photos_sha256 ON photos(sha256);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS location_source TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS exif_checked_at TIMESTAMPTZ;
DO $$
DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'photos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%location_source%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE photos DROP CONSTRAINT %I', constraint_name);
  END IF;
  ALTER TABLE photos ADD CONSTRAINT photos_location_source_check
    CHECK (location_source IS NULL OR location_source IN ('exif','track','import','missing'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS photo_annotations (
  photo_id TEXT PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unstarted' CHECK (status IN ('unstarted','draft','complete','needs_review')),
  version INTEGER NOT NULL DEFAULT 1,
  quality_selected TEXT CHECK (quality_selected IN ('yes','no')),
  pheno_period TEXT,
  residence TEXT CHECK (residence IN ('yes','no')),
  feather_perc DOUBLE PRECISION CHECK (feather_perc IS NULL OR feather_perc BETWEEN 0 AND 100),
  feather_occ TEXT CHECK (feather_occ IN ('yes','no')),
  ciconia_num INTEGER CHECK (ciconia_num IS NULL OR ciconia_num >= 0),
  env_desc_en TEXT,
  remarks TEXT,
  altitude TEXT,
  fly_ground TEXT CHECK (fly_ground IS NULL OR fly_ground IN ('ground','fly','uncertain')),
  above_ground DOUBLE PRECISION,
  height_class_100m INTEGER,
  thermal_updraft TEXT CHECK (thermal_updraft IS NULL OR thermal_updraft IN ('yes','no','?')),
  activity_class TEXT,
  agriculture_type TEXT,
  foraging_habitat_group TEXT,
  roost_site_group TEXT,
  period_day TEXT CHECK (period_day IS NULL OR period_day IN ('day','night')),
  artificial_lights TEXT CHECK (artificial_lights IS NULL OR artificial_lights IN ('yes','no')),
  water_presence_class TEXT,
  spec1_abund INTEGER CHECK (spec1_abund IS NULL OR spec1_abund >= 1),
  spec1_name TEXT,
  spec2_abund INTEGER CHECK (spec2_abund IS NULL OR spec2_abund >= 1),
  spec2_name TEXT,
  created_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  updated_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_annotations_status ON photo_annotations(status);
ALTER TABLE photo_annotations DROP CONSTRAINT IF EXISTS photo_annotations_altitude_check;
ALTER TABLE photo_annotations ADD COLUMN IF NOT EXISTS completed_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT;
ALTER TABLE photo_annotations ADD COLUMN IF NOT EXISTS verified_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT;
ALTER TABLE photo_annotations ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
UPDATE photo_annotations SET completed_by=COALESCE(created_by,updated_by) WHERE status='complete' AND completed_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_annotations_completed_by_status ON photo_annotations(completed_by,status,completed_at DESC);

CREATE TABLE IF NOT EXISTS annotation_options (
  field_key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (field_key,value)
);
CREATE INDEX IF NOT EXISTS idx_annotation_options_field ON annotation_options(field_key,value);
ALTER TABLE annotation_options ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE annotation_options ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE annotation_options ADD COLUMN IF NOT EXISTS reviewed_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT;
ALTER TABLE annotation_options ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE annotation_options ADD COLUMN IF NOT EXISTS replacement_value TEXT;
DO $$ BEGIN
  ALTER TABLE annotation_options ADD CONSTRAINT annotation_options_status_check CHECK (status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_annotation_options_status ON annotation_options(status,created_at);

CREATE TABLE IF NOT EXISTS user_photo_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  sort_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,photo_id)
);
ALTER TABLE user_photo_favorites ADD COLUMN IF NOT EXISTS sort_order INTEGER;
WITH ordered AS (
  SELECT user_id,photo_id,row_number() OVER(PARTITION BY user_id ORDER BY created_at,photo_id)::integer position
  FROM user_photo_favorites
)
UPDATE user_photo_favorites favorite SET sort_order=ordered.position
FROM ordered WHERE favorite.user_id=ordered.user_id AND favorite.photo_id=ordered.photo_id AND favorite.sort_order IS NULL;
CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON user_photo_favorites(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_user_order ON user_photo_favorites(user_id,sort_order,created_at);

CREATE TABLE IF NOT EXISTS photo_safe_user_shares (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(owner_user_id,shared_with_user_id),
  CHECK(owner_user_id<>shared_with_user_id)
);
CREATE INDEX IF NOT EXISTS idx_photo_safe_user_shares_recipient ON photo_safe_user_shares(shared_with_user_id,revoked_at,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_safe_user_shares_owner ON photo_safe_user_shares(owner_user_id,revoked_at,created_at DESC);

CREATE TABLE IF NOT EXISTS photo_safe_public_shares (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS idx_photo_safe_public_shares_owner ON photo_safe_public_shares(owner_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_safe_public_shares_active ON photo_safe_public_shares(token_hash,expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS photo_ratings (
  user_id TEXT NOT NULL REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,photo_id)
);
CREATE INDEX IF NOT EXISTS idx_photo_ratings_photo ON photo_ratings(photo_id,rating);

-- Anonymous scientific photo surveys are deliberately independent of photo_ratings.
CREATE TABLE IF NOT EXISTS survey_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  created_by TEXT NOT NULL REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  date_from TIMESTAMPTZ,
  date_to TIMESTAMPTZ,
  photo_count INTEGER NOT NULL DEFAULT 30 CHECK (photo_count BETWEEN 1 AND 500),
  link_type TEXT NOT NULL CHECK (link_type IN ('reusable','single_use')),
  expires_at TIMESTAMPTZ,
  demographic_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  project_url TEXT,
  intro_pl TEXT NOT NULL,
  intro_en TEXT NOT NULL,
  thanks_pl TEXT NOT NULL,
  thanks_en TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(date_to IS NULL OR date_from IS NULL OR date_to>=date_from)
);
CREATE INDEX IF NOT EXISTS idx_survey_campaigns_status ON survey_campaigns(status,expires_at,created_at DESC);

CREATE TABLE IF NOT EXISTS survey_links (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  link_type TEXT NOT NULL CHECK (link_type IN ('reusable','single_use')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_survey_links_campaign ON survey_links(campaign_id,status,created_at);

CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
  link_id TEXT NOT NULL REFERENCES survey_links(id) ON DELETE CASCADE,
  respondent_token_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed')),
  demographics JSONB NOT NULL DEFAULT '{}'::jsonb,
  age_confirmed BOOLEAN NOT NULL,
  consent_accepted BOOLEAN NOT NULL,
  included BOOLEAN NOT NULL DEFAULT true,
  quality_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_survey_responses_campaign_status ON survey_responses(campaign_id,status,included,started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_single_response_per_link ON survey_responses(link_id) WHERE respondent_token_hash IS NULL;

CREATE TABLE IF NOT EXISTS survey_response_photos (
  response_id TEXT NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position>0),
  PRIMARY KEY(response_id,position),
  UNIQUE(response_id,photo_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_response_photos_photo ON survey_response_photos(photo_id,response_id);

CREATE TABLE IF NOT EXISTS survey_photo_ratings (
  response_id TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(response_id,photo_id),
  FOREIGN KEY(response_id,photo_id) REFERENCES survey_response_photos(response_id,photo_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_survey_photo_ratings_photo ON survey_photo_ratings(photo_id,rating,response_id);

CREATE TABLE IF NOT EXISTS annotation_review_requests (
  id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  field_key TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected')),
  created_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON annotation_review_requests(status,created_at);

CREATE TABLE IF NOT EXISTS contribution_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id=1),
  initial_browsing_allowance INTEGER NOT NULL DEFAULT 30 CHECK (initial_browsing_allowance>=0),
  photos_per_completed INTEGER NOT NULL DEFAULT 5 CHECK (photos_per_completed>0),
  best_pictures_threshold INTEGER NOT NULL DEFAULT 50 CHECK (best_pictures_threshold>0),
  full_access_threshold INTEGER NOT NULL DEFAULT 400 CHECK (full_access_threshold>0),
  acknowledgement_threshold INTEGER NOT NULL DEFAULT 600 CHECK (acknowledgement_threshold>0),
  scientific_threshold INTEGER NOT NULL DEFAULT 2000 CHECK (scientific_threshold>0),
  auto_promote_full_access BOOLEAN NOT NULL DEFAULT true,
  scientific_message TEXT NOT NULL DEFAULT 'Your contribution qualifies you for individual consideration for co-authorship in publications substantially using your annotated data.',
  level_names JSONB NOT NULL DEFAULT '{"nestling":"Nestling","fieldHelper":"Field Helper","fullContributor":"Full Contributor","acknowledgedContributor":"Acknowledged Contributor","scientificContributor":"Scientific Contributor"}'::jsonb,
  updated_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO contribution_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
UPDATE contribution_settings SET scientific_threshold=2000 WHERE scientific_threshold=1000;

CREATE TABLE IF NOT EXISTS user_contribution_overrides (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  initial_browsing_allowance INTEGER CHECK (initial_browsing_allowance IS NULL OR initial_browsing_allowance>=0),
  photos_per_completed INTEGER CHECK (photos_per_completed IS NULL OR photos_per_completed>0),
  best_pictures_threshold INTEGER CHECK (best_pictures_threshold IS NULL OR best_pictures_threshold>0),
  full_access_threshold INTEGER CHECK (full_access_threshold IS NULL OR full_access_threshold>0),
  acknowledgement_threshold INTEGER CHECK (acknowledgement_threshold IS NULL OR acknowledgement_threshold>0),
  scientific_threshold INTEGER CHECK (scientific_threshold IS NULL OR scientific_threshold>0),
  auto_promote_full_access BOOLEAN,
  scientific_message TEXT,
  level_names JSONB,
  updated_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
UPDATE user_contribution_overrides SET scientific_threshold=2000 WHERE scientific_threshold=1000;

CREATE TABLE IF NOT EXISTS contribution_stats (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  completed_annotations INTEGER NOT NULL DEFAULT 0,
  verified_annotations INTEGER NOT NULL DEFAULT 0,
  browsed_photos INTEGER NOT NULL DEFAULT 0,
  browse_cycle_no BIGINT NOT NULL DEFAULT 1,
  browse_cycle_started_at TIMESTAMPTZ,
  recalculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE contribution_stats ADD COLUMN IF NOT EXISTS browse_cycle_no BIGINT NOT NULL DEFAULT 1;
ALTER TABLE contribution_stats ADD COLUMN IF NOT EXISTS browse_cycle_started_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS contribution_milestones (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL,
  reached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at_reach INTEGER NOT NULL,
  PRIMARY KEY(user_id,milestone_key)
);

CREATE TABLE IF NOT EXISTS user_photo_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  access_source TEXT NOT NULL CHECK(access_source IN ('browse','annotation','task','legacy','admin')),
  counts_against_allowance BOOLEAN NOT NULL DEFAULT true,
  first_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,photo_id)
);
CREATE INDEX IF NOT EXISTS idx_user_photo_access_allowance ON user_photo_access(user_id,counts_against_allowance);

CREATE TABLE IF NOT EXISTS user_browse_cycle_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cycle_no BIGINT NOT NULL DEFAULT 1 CHECK(cycle_no>0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_completed_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
  last_completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_browse_cycle_photos (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_no BIGINT NOT NULL CHECK(cycle_no>0),
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  first_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,cycle_no,photo_id)
);
CREATE INDEX IF NOT EXISTS idx_browse_cycle_photos_current ON user_browse_cycle_photos(user_id,cycle_no);
CREATE INDEX IF NOT EXISTS idx_browse_cycle_photos_photo ON user_browse_cycle_photos(user_id,photo_id);

CREATE TABLE IF NOT EXISTS restricted_annotation_focus (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,photo_id)
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='restricted_annotation_focus'::regclass
      AND contype='p'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (user_id)'
  ) THEN
    ALTER TABLE restricted_annotation_focus DROP CONSTRAINT restricted_annotation_focus_pkey;
    ALTER TABLE restricted_annotation_focus ADD PRIMARY KEY(user_id,photo_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_restricted_annotation_focus_photo ON restricted_annotation_focus(photo_id);

CREATE TABLE IF NOT EXISTS annotation_tasks (
  id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  assigned_to TEXT NOT NULL REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  created_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_annotation_tasks_user_status ON annotation_tasks(assigned_to,status,created_at DESC);

CREATE TABLE IF NOT EXISTS annotation_history (
  id BIGSERIAL PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  changed_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot JSONB NOT NULL,
  UNIQUE (photo_id, version)
);

CREATE TABLE IF NOT EXISTS gps_points (
  id BIGSERIAL PRIMARY KEY,
  individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ,
  sequence_no BIGINT,
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  altitude_m DOUBLE PRECISION,
  point_type TEXT,
  count_n INTEGER,
  source_hash TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gps_source_hash ON gps_points(source_hash) WHERE source_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gps_individual_time ON gps_points(individual_id, observed_at, sequence_no);

CREATE TABLE IF NOT EXISTS stopovers (
  id TEXT PRIMARY KEY,
  individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
  time_start TIMESTAMPTZ,
  time_end TIMESTAMPTZ,
  geometry_geojson JSONB NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stopovers_individual_time ON stopovers(individual_id, time_start, time_end);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_sha256 TEXT,
  status TEXT NOT NULL CHECK (status IN ('previewed','started','completed','failed','cancelled')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  staging_path TEXT,
  created_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- Upgrade databases created by earlier releases without losing import history.
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS input_manifest JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS staging_path TEXT;
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT;
DO $$
DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'import_batches'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE import_batches DROP CONSTRAINT %I', constraint_name);
  END IF;
  ALTER TABLE import_batches ADD CONSTRAINT import_batches_status_check
    CHECK (status IN ('previewed','started','completed','failed','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON import_batches(created_at DESC);

CREATE TABLE IF NOT EXISTS import_issues (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT REFERENCES import_batches(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL,
  source_row INTEGER,
  source_key TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT REFERENCES user_attributions(user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  ip_address TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id, created_at DESC);

-- One administrator-managed plain-text template is shared by SMTP and every
-- client-side fallback. Defaults preserve the invitation used before this table existed.
CREATE TABLE IF NOT EXISTS email_invitation_settings (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  subject_template TEXT NOT NULL CHECK (char_length(subject_template) BETWEEN 1 AND 200),
  body_template TEXT NOT NULL CHECK (char_length(body_template) BETWEEN 1 AND 10000),
  updated_by TEXT REFERENCES user_attributions(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO email_invitation_settings(id,subject_template,body_template)
VALUES(1,'Zaproszenie do Stork Photo Editor',$invite_default$Witaj {{name}},

Masz konto w aplikacji Stork Photo Editor.

Aplikacja: {{appUrl}}
Email: {{email}}
Twoja rola: {{role}}.
Uprawnienia: {{permissions}}{{accessDescription}}

Hasło tymczasowe: {{temporaryPassword}}

Po pierwszym logowaniu trzeba zmienić hasło.

Instrukcja:
1. Otwórz aplikację.
2. Zaloguj się emailem i hasłem tymczasowym.
3. Ustaw własne hasło.
4. Rozpocznij pracę z przydzielonymi zdjęciami.

Stork Photo Editor$invite_default$)
ON CONFLICT(id) DO NOTHING;

-- Upgrade historical actor references from login accounts to durable attribution.
-- Authentication-owned tables keep their users(id) CASCADE constraints.
DO $$
DECLARE
  relation_name TEXT;
  column_name TEXT;
  constraint_name TEXT;
BEGIN
  FOR relation_name,column_name,constraint_name IN
    SELECT * FROM (VALUES
      ('photo_annotations','created_by','photo_annotations_created_by_fkey'),
      ('photo_annotations','updated_by','photo_annotations_updated_by_fkey'),
      ('photo_annotations','completed_by','photo_annotations_completed_by_fkey'),
      ('photo_annotations','verified_by','photo_annotations_verified_by_fkey'),
      ('annotation_options','created_by','annotation_options_created_by_fkey'),
      ('annotation_options','reviewed_by','annotation_options_reviewed_by_fkey'),
      ('photo_ratings','user_id','photo_ratings_user_id_fkey'),
      ('annotation_review_requests','created_by','annotation_review_requests_created_by_fkey'),
      ('annotation_review_requests','resolved_by','annotation_review_requests_resolved_by_fkey'),
      ('contribution_settings','updated_by','contribution_settings_updated_by_fkey'),
      ('user_contribution_overrides','updated_by','user_contribution_overrides_updated_by_fkey'),
      ('annotation_tasks','assigned_to','annotation_tasks_assigned_to_fkey'),
      ('annotation_tasks','created_by','annotation_tasks_created_by_fkey'),
      ('annotation_history','changed_by','annotation_history_changed_by_fkey'),
      ('import_batches','created_by','import_batches_created_by_fkey'),
      ('audit_log','user_id','audit_log_user_id_fkey')
    ) AS historical_reference(relation_name,column_name,constraint_name)
  LOOP
    IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=relation_name::regclass AND conname=constraint_name AND confrelid='users'::regclass) THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',relation_name,constraint_name);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=relation_name::regclass AND conname=constraint_name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(%I) REFERENCES user_attributions(user_id) ON DELETE RESTRICT',relation_name,constraint_name,column_name);
    END IF;
  END LOOP;
END $$;
