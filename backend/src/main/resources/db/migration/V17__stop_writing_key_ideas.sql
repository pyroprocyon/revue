-- Cards no longer have key ideas, so the application stops writing this column. It stays for one release because
-- the previous version still reads and writes it; dropping it now would break a rollback.
alter table cards alter column key_ideas set default '{}';
