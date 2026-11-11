-- One row serializes complete catalog publication across all app instances.
CREATE TABLE catalog_publication (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
    digest text NOT NULL DEFAULT '',
    published_at timestamptz
);
INSERT INTO catalog_publication (singleton) VALUES (true);
CREATE INDEX sets_active_title_id_idx ON sets (title, id) WHERE retired_at IS NULL;
