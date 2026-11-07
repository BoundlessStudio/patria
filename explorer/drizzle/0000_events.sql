CREATE TABLE event_publishers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  coverage TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL,
  cohort TEXT NOT NULL,
  config TEXT NOT NULL,
  status TEXT NOT NULL,
  last_attempt INTEGER,
  last_success INTEGER,
  next_check INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  checks INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  first_verified_check INTEGER,
  last_error TEXT,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX event_publishers_due ON event_publishers (status, next_check, lease_until);
--> statement-breakpoint
CREATE TABLE event_venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  region TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  timezone TEXT NOT NULL,
  evidence_url TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX event_venues_nearby ON event_venues (latitude, longitude);
--> statement-breakpoint
CREATE TABLE event_occurrences (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  venue_id TEXT NOT NULL REFERENCES event_venues (id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  has_end INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX event_occurrences_nearby ON event_occurrences (venue_id, start_at, end_at);
--> statement-breakpoint
CREATE TABLE event_evidence (
  publisher_id TEXT NOT NULL REFERENCES event_publishers (id),
  external_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL REFERENCES event_occurrences (id),
  url TEXT NOT NULL,
  booking_url TEXT,
  status TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (publisher_id, external_id, occurrence_id)
);
--> statement-breakpoint
CREATE INDEX event_evidence_occurrence ON event_evidence (occurrence_id, status, checked_at);
--> statement-breakpoint
CREATE TABLE event_holds (
  publisher_id TEXT NOT NULL REFERENCES event_publishers (id),
  external_id TEXT NOT NULL,
  title TEXT,
  url TEXT,
  reason TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (publisher_id, external_id)
);
--> statement-breakpoint
CREATE TABLE event_geocodes (
  address_key TEXT PRIMARY KEY,
  result TEXT,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE event_discovery (
  id TEXT PRIMARY KEY,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  date_window TEXT NOT NULL,
  radius INTEGER NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after INTEGER NOT NULL,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  reason TEXT
);
--> statement-breakpoint
CREATE INDEX event_discovery_due ON event_discovery (state, run_after, lease_until);
