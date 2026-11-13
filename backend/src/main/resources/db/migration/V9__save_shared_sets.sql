-- Membership refers to shared content; each learner owns independent scheduling state.
create table saved_sets (
    user_id uuid not null references users(id) on delete restrict,
    set_id bigint not null references sets(id) on delete restrict,
    saved_at timestamptz not null,
    primary key (user_id, set_id)
);
create index saved_sets_set on saved_sets(set_id);

create table schedules (
    user_id uuid not null references users(id) on delete restrict,
    card_id bigint not null references cards(id) on delete restrict,
    scheduler_id varchar(100) not null,
    scheduler_state jsonb not null check (jsonb_typeof(scheduler_state) = 'object'),
    recommended_review_date date,
    next_review_date date,
    last_reviewed_at timestamptz,
    last_reviewed_content_version integer check (last_reviewed_content_version >= 1),
    version bigint not null default 0 check (version >= 0),
    primary key (user_id, card_id),
    constraint schedules_review_state check (
        (last_reviewed_at is null and last_reviewed_content_version is null
            and recommended_review_date is null and next_review_date is null and version = 0)
        or (last_reviewed_at is not null and last_reviewed_content_version is not null
            and recommended_review_date is not null and next_review_date is not null and version > 0)
    )
);
create index schedules_card on schedules(card_id);
create index schedules_due on schedules(user_id, next_review_date, card_id);
