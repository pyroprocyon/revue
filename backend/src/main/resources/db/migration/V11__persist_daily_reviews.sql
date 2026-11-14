alter table users add column first_study_date date;
alter table users add column second_study_date date;
alter table users add constraint users_study_dates check (
    second_study_date is null or (first_study_date is not null and second_study_date > first_study_date)
);

create table review_logs (
    id bigint generated always as identity primary key,
    user_id uuid not null references users(id) on delete restrict,
    card_id bigint not null references cards(id) on delete restrict,
    request_id uuid not null,
    review_contract varchar(20) not null check (review_contract = 'mvp-1'),
    rating varchar(10) not null check (rating in ('AGAIN', 'HARD', 'GOOD', 'EASY')),
    attempt_mode varchar(10) not null check (attempt_mode in ('ANSWERED', 'SHOWN')),
    expected_schedule_version bigint not null check (expected_schedule_version >= 0),
    reviewed_content_version integer not null check (reviewed_content_version >= 1),
    reviewed_at timestamptz not null,
    local_review_date date not null,
    scheduler_id varchar(100) not null,
    recommended_review_date date not null,
    next_review_date date not null,
    schedule_version_after bigint not null,
    unique (user_id, request_id),
    check (attempt_mode <> 'SHOWN' or rating = 'AGAIN'),
    check (schedule_version_after = expected_schedule_version + 1),
    check (next_review_date > local_review_date),
    check (recommended_review_date = next_review_date)
);
create index review_logs_daily_new on review_logs(user_id, local_review_date)
    where expected_schedule_version = 0;
create index review_logs_history on review_logs(user_id, card_id, reviewed_at, id);
