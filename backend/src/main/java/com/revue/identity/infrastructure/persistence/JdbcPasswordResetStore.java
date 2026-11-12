package com.revue.identity.infrastructure.persistence;

import com.revue.AfterCommit;
import com.revue.identity.application.PasswordResetStore;
import com.revue.identity.domain.PasswordHash;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Saves the replacement hash and session revocation in the same database update. */
@Repository
class JdbcPasswordResetStore implements PasswordResetStore {
    private static final Logger LOG = LoggerFactory.getLogger(JdbcPasswordResetStore.class);

    private final JdbcTemplate jdbc;

    JdbcPasswordResetStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional(timeout = 5)
    public boolean replace(UUID accountId, long expectedVersion, PasswordHash replacement) {
        boolean replaced = jdbc.update("""
            update users
            set password_hash = ?, credential_version = credential_version + 1, credential_reset_required = false
            where id = ? and credential_version = ? and username is not null
                and suspended_at is null and deletion_request_id is null
            """, replacement.value(), accountId, expectedVersion) == 1;
        if (replaced) {
            AfterCommit.log(
                () -> LOG.atInfo()
                    .addKeyValue("event.name", "account.password_reset")
                    .addKeyValue("event.outcome", "success")
                    .addKeyValue("entity.type", "account_credential_version")
                    .addKeyValue("entity.id", accountId.toString())
                    .addKeyValue("state.from", expectedVersion)
                    .addKeyValue("state.to", expectedVersion + 1)
                    .log("Password reset committed and prior credential versions invalidated"));
        }
        return replaced;
    }
}
