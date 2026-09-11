-- TimeSheet app schema (PostgreSQL)
-- Lives entirely inside its own "timesheet" schema so it never touches
-- tables belonging to other apps (e.g. audit-capa) sharing this database.
-- Mirrors the shape of src/data/mockData.js / AppContext.jsx so the frontend
-- data model doesn't need to change while we move it from localStorage to a
-- real database.

CREATE SCHEMA IF NOT EXISTS timesheet;

CREATE TABLE IF NOT EXISTS timesheet.users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL CHECK (role IN ('employee', 'manager')),
  manager_id   TEXT REFERENCES timesheet.users(id) ON DELETE SET NULL,
  -- 'pending' = a brand-new employee who either hasn't picked a reporting manager yet, or has
  -- picked one but that manager hasn't approved them yet - blocked from everything except the
  -- picker/waiting screens (see server/src/routes/users.js) until 'active'. Defaults to 'active'
  -- so every user that existed before this column was added (already using the app) is
  -- unaffected - only brand-new sign-ins go through the new pick-a-manager gate.
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- IF NOT EXISTS makes this a no-op (CHECK included) once the column already exists, so re-running
-- this file against an already-migrated DB stays safe, same as every CREATE TABLE IF NOT EXISTS above.
ALTER TABLE timesheet.users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active'));

CREATE TABLE IF NOT EXISTS timesheet.projects (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timesheet.tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES timesheet.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL
);

-- Which SAP modules (tasks) are selectable in a given user's entry grid.
CREATE TABLE IF NOT EXISTS timesheet.assignments (
  user_id  TEXT NOT NULL REFERENCES timesheet.users(id) ON DELETE CASCADE,
  task_id  TEXT NOT NULL REFERENCES timesheet.tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, task_id)
);

-- Singleton row of team-wide settings (deadlineDaysAfterMonthEnd, etc).
CREATE TABLE IF NOT EXISTS timesheet.team_settings (
  id                             BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  deadline_days_after_month_end  INTEGER NOT NULL DEFAULT 2
);
INSERT INTO timesheet.team_settings (id, deadline_days_after_month_end)
VALUES (TRUE, 2)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS timesheet.timesheets (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES timesheet.users(id) ON DELETE CASCADE,
  month_start_date  DATE NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('Draft', 'Submitted', 'Resubmitted', 'Approved', 'Rejected')),
  manager_comment   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_start_date)
);
CREATE INDEX IF NOT EXISTS idx_timesheets_user ON timesheet.timesheets(user_id);

-- One row per status transition (Draft -> Submitted -> Approved/Rejected -> ...).
CREATE TABLE IF NOT EXISTS timesheet.timesheet_history (
  id            SERIAL PRIMARY KEY,
  timesheet_id  TEXT NOT NULL REFERENCES timesheet.timesheets(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  comment       TEXT,
  action        TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_timesheet ON timesheet.timesheet_history(timesheet_id);

-- Individual day/task lines. A day taken as leave has task_id/project_id
-- NULL and leave_type set; a worked day has leave_type NULL. Hours come
-- purely from in_time/out_time - a task is optional for hours to count.
CREATE TABLE IF NOT EXISTS timesheet.timesheet_entries (
  id            TEXT PRIMARY KEY,
  timesheet_id  TEXT NOT NULL REFERENCES timesheet.timesheets(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES timesheet.users(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES timesheet.projects(id) ON DELETE SET NULL,
  task_id       TEXT REFERENCES timesheet.tasks(id) ON DELETE SET NULL,
  entry_date    DATE NOT NULL,
  in_time       TIME,
  out_time      TIME,
  hours         NUMERIC(5, 2) NOT NULL DEFAULT 0,
  note          TEXT,
  leave_type    TEXT,
  location      TEXT,
  location_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_entries_timesheet ON timesheet.timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_entries_user_date ON timesheet.timesheet_entries(user_id, entry_date);

-- One yearly leave pool per employee, set by their manager (defaults to 24 days, same as any
-- new hire gets before a manager adjusts it). Remaining balance is always allocated minus
-- however many timesheet_entries already carry an accrual leave_type (Sick/Casual/Earned -
-- Unpaid and Public Holiday don't draw from this pool), so it never drifts out of sync with
-- what was actually taken.
CREATE TABLE IF NOT EXISTS timesheet.leave_balances (
  user_id    TEXT PRIMARY KEY REFERENCES timesheet.users(id) ON DELETE CASCADE,
  allocated  NUMERIC(6, 2) NOT NULL DEFAULT 24
);

-- Keep timesheets.updated_at current whenever its entries change.
CREATE OR REPLACE FUNCTION timesheet.touch_timesheet_updated_at() RETURNS TRIGGER AS $$
BEGIN
  UPDATE timesheet.timesheets SET updated_at = now() WHERE id = COALESCE(NEW.timesheet_id, OLD.timesheet_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_timesheet ON timesheet.timesheet_entries;
CREATE TRIGGER trg_touch_timesheet
AFTER INSERT OR UPDATE OR DELETE ON timesheet.timesheet_entries
FOR EACH ROW EXECUTE FUNCTION timesheet.touch_timesheet_updated_at();
