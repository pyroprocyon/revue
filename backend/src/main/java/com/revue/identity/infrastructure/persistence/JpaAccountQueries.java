package com.revue.identity.infrastructure.persistence;

import com.revue.identity.application.AccountQueries;
import com.revue.identity.domain.Account;
import com.revue.identity.domain.Username;
import jakarta.persistence.EntityManager;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/** Reads and locks account credentials through the JPA persistence context. */
@Repository
public class JpaAccountQueries implements AccountQueries {
    private final EntityManager entityManager;

    public JpaAccountQueries(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    public Optional<Credentials> byUsername(Username username) {
        var row = entityManager.createQuery("select a from Account a where a.username = :username", AccountRow.class)
            .setParameter("username", username.value())
            .getSingleResultOrNull();
        return Optional.ofNullable(row).map(AccountRow::toCredentials);
    }

    @Override
    public Optional<Username> sessionUsername(UUID id, long credentialVersion) {
        var row = entityManager.createQuery("""
            select a.username, a.deletionId is not null, a.suspendedAt is not null, a.resetRequired
            from Account a
            where a.id = :id and a.credentialVersion = :credentialVersion and a.username is not null
            """, SessionAccount.class)
            .setParameter("id", id)
            .setParameter("credentialVersion", credentialVersion)
            .getSingleResultOrNull();
        if (row == null
            || Account
                .usernameAccess(row.deletionPending(), row.suspended(), row.resetRequired()) != Account.Access.ACTIVE) {
            return Optional.empty();
        }
        return Optional.of(new Username(row.username()));
    }

    @Override
    public Optional<Credentials> lock(UUID id) {
        var row = (AccountRow) entityManager
            .createNativeQuery("select * from users where id = :id for no key update", AccountRow.class)
            .setParameter("id", id)
            .getSingleResultOrNull();
        return Optional.ofNullable(row).map(AccountRow::toCredentials);
    }

    private record SessionAccount(String username, boolean deletionPending, boolean suspended, boolean resetRequired) {
    }
}
