package com.revue.identity.infrastructure.persistence;

import com.revue.identity.application.PasswordResetStore;
import com.revue.identity.domain.PasswordHash;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Saves the replacement hash and session revocation in the same database update. */
@Repository
class JdbcPasswordResetStore implements PasswordResetStore {
    private final JdbcTemplate jdbc;

    JdbcPasswordResetStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional(timeout = 5)
    public boolean replace(UUID accountId, long expectedVersion, PasswordHash replacement) {
        return jdbc.update("""
            update users
            set password_hash = ?, credential_version = credential_version + 1, credential_reset_required = false
            where id = ? and credential_version = ? and username is not null
                and suspended_at is null and deletion_request_id is null
            """, replacement.value(), accountId, expectedVersion) == 1;
    }
}
