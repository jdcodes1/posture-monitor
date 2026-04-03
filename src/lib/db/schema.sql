CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  total_checks INT DEFAULT 0,
  good_checks INT DEFAULT 0,
  score FLOAT
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  total_checks INT DEFAULT 0,
  good_checks INT DEFAULT 0,
  avg_score FLOAT,
  best_streak INT DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS hourly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  hour INT NOT NULL,
  total_checks INT DEFAULT 0,
  good_checks INT DEFAULT 0,
  UNIQUE(user_id, date, hour)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_user_date ON daily_stats(user_id, date);
CREATE INDEX IF NOT EXISTS idx_hourly_user_date ON hourly_stats(user_id, date);
