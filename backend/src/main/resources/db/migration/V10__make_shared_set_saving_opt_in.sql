-- Existing onboarding sets and future file imports are practice-only by default.
-- Memberships and schedules from earlier saves are retained.
alter table sets add column save_allowed boolean not null default false;
