package com.revue.identity.infrastructure.persistence;

import com.revue.identity.application.AccountQueries;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.Username;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/** Reads and locks account credentials through the JPA persistence context. */
@Repository
public class JpaAccountQueries implements AccountQueries {
    private final EntityManager entityManager;

    /** Creates the account query adapter using the current persistence context. */
    public JpaAccountQueries(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    public Optional<Credentials> byUsername(Username username) {
        return entityManager
                .createQuery("select a from Account a where a.username = :username", AccountRow.class)
                .setParameter("username", username.value())
                .getResultList()
                .stream()
                .findFirst()
                .map(AccountRow::toCredentials);
    }

    @Override
    public Optional<Credentials> byId(UUID id) {
        return entityManager
                .createQuery("select a from Account a where a.id = :id", AccountRow.class)
                .setParameter("id", id)
                .getResultList()
                .stream()
                .findFirst()
                .map(AccountRow::toCredentials);
    }

    @Override
    public Optional<Credentials> lock(UUID id) {
        var rows =
                entityManager
                        .createNativeQuery("select * from users where id = :id for no key update", AccountRow.class)
                        .setParameter("id", id)
                        .getResultList();
        return rows.stream().findFirst().map(row -> ((AccountRow) row).toCredentials());
    }

    @Override
    public boolean inviteAvailable(TokenHash hash, Instant now) {
        return !entityManager
                .createQuery(
                        """
                        select i.id from SignupInvite i where i.tokenHash = :hash and i.revokedAt is null
                        \tand (i.reusable = true or i.redeemedAt is null) and i.createdAt <= :now and i.expiresAt > :now
                        """,
                        UUID.class)
                .setParameter("hash", hash.value())
                .setParameter("now", now)
                .getResultList()
                .isEmpty();
    }
}
