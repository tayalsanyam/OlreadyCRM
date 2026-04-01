-- Teams: allow multiple BDMs per team (one row per BDM in team)
-- Plan: team_id, team_name, bdm - one row per BDM

ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_team_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_team_id_bdm ON teams (team_id, bdm);
