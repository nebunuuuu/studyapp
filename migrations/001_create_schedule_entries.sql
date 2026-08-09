CREATE TABLE IF NOT EXISTS schedule_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  room TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'ora',
  parity TEXT NOT NULL DEFAULT 'all',
  color TEXT NOT NULL DEFAULT '#5b5bf0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_user_id
  ON schedule_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_course_id
  ON schedule_entries(course_id);
