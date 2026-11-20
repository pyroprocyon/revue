-- Keep import receipts after the deck or its cards are deleted, so a delayed retry cannot recreate them.
create table deck_import_requests (
    owner_id uuid not null references users(id) on delete cascade,
    request_id uuid not null,
    deck_id bigint not null,
    request_hash bytea not null,
    imported_cards integer not null check (imported_cards > 0),
    primary key (owner_id, request_id)
);
