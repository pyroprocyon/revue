alter table deck_creation_requests add column request_hash bytea;

-- V15 matched retries against the surviving content. Earlier revisions cannot be recovered.
update deck_creation_requests r
set request_hash = sha256(array_send(array[d.title]::text[]))
from decks d
where r.parent_deck_id is null and d.id = r.created_id and d.owner_id = r.owner_id;

update deck_creation_requests r
set request_hash = sha256(array_send(array[c.question, c.answer, c.explanation, c.memory_hook, c.source]::text[]))
from cards c join decks d on d.id = c.deck_id
where r.parent_deck_id = c.deck_id and r.created_id = c.id and r.owner_id = d.owner_id;
