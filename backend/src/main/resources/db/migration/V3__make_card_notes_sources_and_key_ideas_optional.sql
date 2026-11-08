-- A card is a question and an answer, like one a student or teacher writes. The explanation, shown
-- as a short note on the back of the card, and the source are optional, and so are key ideas.
ALTER TABLE cards ALTER COLUMN explanation DROP NOT NULL;
ALTER TABLE cards ALTER COLUMN source DROP NOT NULL;

ALTER TABLE cards DROP CONSTRAINT cards_key_ideas_check;
ALTER TABLE cards ADD CONSTRAINT cards_key_ideas_check CHECK (cardinality(key_ideas) <= 2);
