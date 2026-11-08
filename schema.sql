CREATE TABLE IF NOT EXISTS sources(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0, interval_s INTEGER NOT NULL DEFAULT 3600,
  last_success INTEGER, last_failure INTEGER, last_error TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS fares(
  id TEXT PRIMARY KEY, mode TEXT NOT NULL, origin TEXT NOT NULL, destination TEXT NOT NULL,
  operator TEXT NOT NULL, price_zar REAL NOT NULL, source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECENT REPORT',
  collected_at INTEGER NOT NULL, verified_at INTEGER, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS fares_route ON fares(origin,destination,mode);
CREATE TABLE IF NOT EXISTS fare_history(
  fare_id TEXT, price_zar REAL, at INTEGER);
CREATE TABLE IF NOT EXISTS incidents(
  id TEXT PRIMARY KEY, road TEXT, direction TEXT, category TEXT, description TEXT,
  lat REAL, lon REAL, reported_at INTEGER, verified_at INTEGER, source TEXT,
  confidence REAL, status TEXT);
-- Sources start DISABLED. Nothing is "connected" until access/licensing is confirmed.
INSERT OR IGNORE INTO sources(id,name,category,enabled,interval_s,note) VALUES
 ('sanral','SANRAL / i-TRAFFIC','traffic',0,300,'Access and licence to be established'),
 ('tomtom','TomTom Traffic','traffic',0,300,'Commercial API key required'),
 ('bus','Bus operator fares','bus',0,1800,'Check each operator data terms'),
 ('air','Airline / flight APIs','air',0,3600,'Partner agreements required'),
 ('contrib','Minibus fare contributors','minibus',1,0,'Manual submissions via admin API');
