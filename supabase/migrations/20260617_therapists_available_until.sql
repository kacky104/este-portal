ALTER TABLE therapists
  ADD COLUMN IF NOT EXISTS available_until timestamptz;
