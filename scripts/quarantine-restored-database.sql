-- Run ONLY on a restored, isolated database BEFORE any app instance can reach it.
-- Recovery keeps all accounts closed until current deletion requests and credential resets are reconciled.
-- Before reopening signup on an older release, rotate REVUE_PILOT_INVITE_CODE if configured.
-- That release accepts the configured code independently of the restored invitation rows.
BEGIN;
DELETE FROM spring_session;
DELETE FROM auth_challenges;
UPDATE signup_invites SET revoked_at = clock_timestamp() WHERE revoked_at IS NULL;
UPDATE users SET credential_version = credential_version + 1, credential_reset_required = true;
COMMIT;
