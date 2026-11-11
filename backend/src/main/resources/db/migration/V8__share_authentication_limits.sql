-- Only SHA-256 digests of canonical identifiers, never usernames or credentials.
CREATE TABLE authentication_attempts (
    identifier_hash char(64) PRIMARY KEY,
    attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 10),
    expires_at timestamptz NOT NULL
);
CREATE INDEX authentication_attempts_expiry_idx ON authentication_attempts (expires_at);
