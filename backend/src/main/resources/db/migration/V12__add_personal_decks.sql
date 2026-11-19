-- A personal deck holds one learner's own private cards (plan sections 5 and 7).
create table decks (
    id bigint generated always as identity primary key,
    owner_id uuid not null references users(id) on delete restrict,
    title text not null,
    created_at timestamptz not null,
    updated_at timestamptz not null
);
create index decks_owner on decks(owner_id, id);

alter table cards add column deck_id bigint references decks(id) on delete restrict;
alter table cards alter column set_id drop not null;
alter table cards alter column content_key drop not null;

-- Every card belongs to exactly one shared set or one personal deck. Only the publication
-- loader finds cards by content key, so personal cards have none.
alter table cards add constraint cards_one_container check (
    (set_id is not null and deck_id is null and content_key is not null)
    or (set_id is null and deck_id is not null and content_key is null)
);
create index cards_deck on cards(deck_id, id) where deck_id is not null;
