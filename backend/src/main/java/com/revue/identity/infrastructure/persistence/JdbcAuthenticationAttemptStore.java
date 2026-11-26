package com.revue.identity.infrastructure.persistence;

import com.revue.identity.application.AuthenticationAttemptStore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** A short, nonwaiting database lock bounds counters globally without holding a connection during hashing. */
@Repository
public class JdbcAuthenticationAttemptStore implements AuthenticationAttemptStore {
    private final JdbcTemplate jdbc;

    public JdbcAuthenticationAttemptStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, timeout = 2)
    public boolean tryAcquire(String identifierHash) {
        // Separate namespace and key from other advisory locks. Losing contenders fail closed.
        if (!Boolean.TRUE
            .equals(jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(1919252085, 1)", Boolean.class))) {
            return false;
        }
        jdbc.update("DELETE FROM authentication_attempts WHERE expires_at <= statement_timestamp()");
        return jdbc.update("""
            INSERT INTO authentication_attempts (identifier_hash, attempts, expires_at)
            SELECT ?, 1, statement_timestamp() + interval '1 minute'
            WHERE CASE WHEN EXISTS (SELECT 1 FROM authentication_attempts WHERE identifier_hash = ?) THEN true
                ELSE (SELECT count(*) FROM authentication_attempts) < 1024 END
            ON CONFLICT (identifier_hash) DO UPDATE SET attempts = authentication_attempts.attempts + 1
            WHERE authentication_attempts.attempts < 10
            """, identifierHash, identifierHash) == 1;
    }
}
