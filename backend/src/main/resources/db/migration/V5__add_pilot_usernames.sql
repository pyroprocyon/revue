-- Keep legacy foundation rows intact; the invited pilot signs in with usernames only.
alter table users add column username varchar(32) unique;
alter table users alter column email drop not null;
alter table users add constraint users_login_identifier check (username is not null or email is not null);
alter table users add constraint users_username_canonical check (username ~ '^[a-z0-9_-]{3,32}$');
