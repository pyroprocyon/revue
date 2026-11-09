package com.revue.identity.infrastructure.persistence;

import com.revue.identity.application.RegistrationStore;
import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.SignupInvite;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.VerificationChallenge;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.stereotype.Repository;

@Repository
public class JpaRegistrationStore implements RegistrationStore {
	private final EntityManager entityManager;

	public JpaRegistrationStore(EntityManager entityManager) {
		this.entityManager = entityManager;
	}

	@Override
	public Optional<SignupInvite> lockInvite(TokenHash tokenHash) {
		return entityManager.createQuery("select i from SignupInvite i where i.tokenHash = :hash", SignupInviteRow.class)
			.setParameter("hash", tokenHash.value()).setLockMode(LockModeType.PESSIMISTIC_WRITE)
			.getResultList().stream().findFirst().map(SignupInviteRow::toDomain);
	}

	@Override
	public boolean insertPendingAccount(Account account, PasswordHash passwordHash) {
		// Expected email conflicts use ON CONFLICT so PostgreSQL/Hibernate do not log the email or hash.
		// No pre-check can replace the unique constraint when different invites race for one email.
		return entityManager.createNativeQuery("""
			insert into users (id, email, password_hash, created_at, credential_version,
				credential_reset_required, privacy_accepted_at, privacy_notice_version, adult_confirmed_at)
			values (:id, :email, :password, :created, :version, false, :privacy, :notice, :adult)
			on conflict on constraint users_email_unique do nothing
			""")
			.setParameter("id", account.id()).setParameter("email", account.email().value())
			.setParameter("password", passwordHash.value()).setParameter("created", account.createdAt())
			.setParameter("version", account.credentialVersion()).setParameter("privacy", account.privacyAcceptedAt())
			.setParameter("notice", account.privacyNoticeVersion()).setParameter("adult", account.adultConfirmedAt())
			.executeUpdate() == 1;
	}

	@Override
	public void saveRedemption(SignupInvite invite) {
		// This managed row was locked by lockInvite in the same application transaction.
		SignupInviteRow row = entityManager.find(SignupInviteRow.class, invite.id());
		row.recordRedemption(invite);
		entityManager.flush();
	}

	@Override
	public boolean insertVerification(VerificationChallenge challenge) {
		int inserted = entityManager.createNativeQuery("""
			insert into auth_challenges (id, user_id, purpose, token_hash, credential_version, created_at, expires_at)
			values (:id, :user, 'VERIFY_EMAIL', :hash, :version, :created, :expires)
			on conflict (token_hash) do nothing
			""")
			.setParameter("id", challenge.id()).setParameter("user", challenge.accountId())
			.setParameter("hash", challenge.tokenHash().value()).setParameter("version", challenge.credentialVersion())
			.setParameter("created", challenge.createdAt()).setParameter("expires", challenge.expiresAt())
			.executeUpdate();
		return inserted == 1;
	}
}
