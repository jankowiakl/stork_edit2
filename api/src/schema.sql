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
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_annotations_status ON photo_annotations(status);
ALTER TABLE photo_annotations DROP CONSTRAINT IF EXISTS photo_annotations_altitude_check;

CREATE TABLE IF NOT EXISTS annotation_options (
  field_key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (field_key,value)
);
CREATE INDEX IF NOT EXISTS idx_annotation_options_field ON annotation_options(field_key,value);

CREATE TABLE IF NOT EXISTS annotation_history (
  id BIGSERIAL PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
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
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- Upgrade databases created by earlier releases without losing import history.
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS input_manifest JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS staging_path TEXT;
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
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
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  ip_address TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id, created_at DESC);
