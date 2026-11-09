-- Password-only pilot foundation. No sessions or ordinary access are granted by registration.
create table users (
    id uuid primary key,
    email varchar(254) not null,
    password_hash varchar(1024) not null,
    created_at timestamptz not null,
    email_verified_at timestamptz,
    credential_version bigint not null default 0 check (credential_version >= 0),
    credential_reset_required boolean not null default false,
    suspended_at timestamptz,
    privacy_accepted_at timestamptz,
    privacy_notice_version varchar(100),
    adult_confirmed_at timestamptz,
    deletion_request_id uuid unique,
    deletion_requested_at timestamptz,
    purge_after timestamptz,
    constraint users_email_unique unique (email),
    constraint users_email_canonical check (
        email = lower(email collate "C") and email !~ '[[:space:]]' and length(email) > 2
    ),
    constraint users_password_hash_present check (length(password_hash) > 0),
    constraint users_privacy_acceptance check (
        (privacy_accepted_at is null and privacy_notice_version is null)
        or (privacy_accepted_at is not null and privacy_notice_version is not null and length(trim(privacy_notice_version)) > 0)
    ),
    constraint users_deletion_state check (
        (deletion_request_id is null and deletion_requested_at is null and purge_after is null)
        or (deletion_request_id is not null and deletion_requested_at is not null and purge_after is not null
            and deletion_requested_at >= created_at and purge_after > deletion_requested_at)
    )
);

create index users_pending_deletion on users (purge_after) where purge_after is not null;
create index users_unverified_created on users (created_at) where email_verified_at is null;

create table signup_invites (
    id uuid primary key,
    token_hash varchar(64) not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null,
    expires_at timestamptz not null check (expires_at > created_at),
    revoked_at timestamptz,
    redeemed_at timestamptz,
    -- Erasure removes the identifying link, never the redemption fact.
    redeemed_by_user_id uuid references users (id) on delete set null,
    constraint signup_invites_redemption check (
        (redeemed_by_user_id is null or redeemed_at is not null)
        and (redeemed_at is null or (redeemed_at >= created_at and redeemed_at < expires_at))
    )
);
create index signup_invites_user on signup_invites (redeemed_by_user_id) where redeemed_by_user_id is not null;
create index signup_invites_expiry on signup_invites (expires_at);

create table auth_challenges (
    id uuid primary key,
    user_id uuid not null references users (id) on delete cascade,
    purpose varchar(32) not null check (purpose in ('VERIFY_EMAIL', 'RESET_PASSWORD')),
    token_hash varchar(64) not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
    credential_version bigint not null check (credential_version >= 0),
    created_at timestamptz not null,
    expires_at timestamptz not null check (expires_at > created_at),
    consumed_at timestamptz check (consumed_at >= created_at)
);
-- Replacing a challenge must consume its predecessor in the same transaction.
create unique index auth_challenges_one_outstanding on auth_challenges (user_id, purpose) where consumed_at is null;
create index auth_challenges_expiry on auth_challenges (expires_at);
