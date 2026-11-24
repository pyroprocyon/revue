create table study_settings (
    user_id uuid primary key references users(id) on delete cascade,
    daily_new_card_limit smallint not null check (daily_new_card_limit in (10, 20))
);
