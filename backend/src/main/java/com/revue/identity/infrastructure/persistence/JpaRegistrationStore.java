package com.revue.identity.infrastructure.persistence;

import com.revue.AfterCommit;
import com.revue.identity.application.RegistrationStore;
import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Repository;

/** Persists account registration within JPA transactions. */
@Repository
public class JpaRegistrationStore implements RegistrationStore {
    private static final Logger LOG = LoggerFactory.getLogger(JpaRegistrationStore.class);

    private final EntityManager entityManager;

    public JpaRegistrationStore(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    public Instant currentTime() {
        return (Instant) entityManager.createNativeQuery("select clock_timestamp()", Instant.class).getSingleResult();
    }

    @Override
    public boolean insertUsernameAccount(Account account, PasswordHash passwordHash) {
        boolean inserted = entityManager.createNativeQuery("""
            insert into users (id, username, password_hash, created_at, credential_version,
            \tcredential_reset_required)
            values (:id, :username, :password, :created, :version, false)
            on conflict (username) do nothing
            """)
            .setParameter("id", account.id())
            .setParameter("username", account.username().value())
            .setParameter("password", passwordHash.value())
            .setParameter("created", account.createdAt())
            .setParameter("version", account.credentialVersion())
            .executeUpdate() == 1;
        if (inserted) {
            AfterCommit.log(
                () -> LOG.atInfo()
                    .addKeyValue("event.name", "account.created")
                    .addKeyValue("event.outcome", "success")
                    .addKeyValue("entity.type", "account")
                    .addKeyValue("entity.id", account.id().toString())
                    .addKeyValue("state.from", "absent")
                    .addKeyValue("state.to", "active")
                    .log("Account committed"));
        }
        return inserted;
    }
}
