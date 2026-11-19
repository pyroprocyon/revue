alter table decks add column archived boolean not null default false;

-- Keep request IDs after a card or deck is deleted so a delayed retry cannot recreate it.
create table deck_creation_requests (
    owner_id uuid not null references users(id) on delete cascade,
    request_id uuid not null,
    parent_deck_id bigint,
    created_id bigint not null,
    primary key (owner_id, request_id)
);
