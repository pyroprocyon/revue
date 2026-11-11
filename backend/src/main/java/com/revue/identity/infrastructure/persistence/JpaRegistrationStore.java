package com.revue.identity.infrastructure.persistence;

import com.revue.identity.application.RegistrationStore;
import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.SignupInvite;
import com.revue.identity.domain.TokenHash;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/** Persists account registration and invitation redemption within JPA transactions. */
@Repository
public class JpaRegistrationStore implements RegistrationStore {
    private final EntityManager entityManager;

    /** Creates the registration store using the current persistence context. */
    public JpaRegistrationStore(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    public Optional<SignupInvite> lockInvite(TokenHash tokenHash) {
        return entityManager
            .createQuery("select i from SignupInvite i where i.tokenHash = :hash", SignupInviteRow.class)
            .setParameter("hash", tokenHash.value())
            .setLockMode(LockModeType.PESSIMISTIC_WRITE)
            .getResultList()
            .stream()
            .findFirst()
            .map(SignupInviteRow::toDomain);
    }

    @Override
    public Instant currentTime() {
        // Transaction-start time would ignore time spent waiting for the invitation lock.
        return (Instant) entityManager.createNativeQuery("select clock_timestamp()", Instant.class).getSingleResult();
    }

    @Override
    public boolean insertUsernameAccount(Account account, PasswordHash passwordHash) {
        return entityManager.createNativeQuery("""
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
    }

    @Override
    public void saveRedemption(SignupInvite invite) {
        // This managed row was locked by lockInvite in the same application transaction.
        SignupInviteRow row = entityManager.find(SignupInviteRow.class, invite.id());
        row.recordRedemption(invite);
        entityManager.flush();
    }
}
