package com.revue.identity.application;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.EmailAddress;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.SignupInvite;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.VerificationChallenge;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Short commit boundary. Hashing, token preparation and delivery belong outside this transaction. */
@Service
public class RegistrationCommit {
	private final RegistrationStore store;
	private final Clock clock;

	public RegistrationCommit(RegistrationStore store, Clock clock) {
		this.store = store;
		this.clock = clock;
	}

	@Transactional
	public Result register(PreparedRegistration prepared) {
		SignupInvite invite = store.lockInvite(prepared.invitationHash())
			.orElseThrow(RegistrationUnavailableException::new);
		// Read after acquiring the lock: time spent waiting must not extend invitation validity.
		Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		Account account = Account.register(UUID.randomUUID(), prepared.email(), prepared.privacyNoticeVersion(), now);
		SignupInvite redeemed;
		try {
			redeemed = invite.redeem(account.id(), now);
		}
		catch (IllegalStateException unavailable) {
			throw new RegistrationUnavailableException();
		}
		VerificationChallenge challenge = new VerificationChallenge(UUID.randomUUID(), account.id(),
			prepared.verificationHash(), account.credentialVersion(), now, prepared.verificationExpiresAt());
		if (!store.insertPendingAccount(account, prepared.passwordHash())) {
			throw new RegistrationUnavailableException();
		}
		store.saveRedemption(redeemed);
		if (!store.insertVerification(challenge)) {
			throw new IllegalStateException("Verification challenge could not be saved");
		}
		return new Result(account.id(), account.credentialVersion());
	}

	/** Internal input from future bounded hashing/token adapters, never an HTTP request DTO. */
	public record PreparedRegistration(EmailAddress email, PasswordHash passwordHash, TokenHash invitationHash,
			TokenHash verificationHash, Instant verificationExpiresAt, String privacyNoticeVersion,
			boolean privacyAccepted, boolean adultConfirmed) {
		public PreparedRegistration {
			Objects.requireNonNull(email);
			Objects.requireNonNull(passwordHash);
			Objects.requireNonNull(invitationHash);
			Objects.requireNonNull(verificationHash);
			Objects.requireNonNull(verificationExpiresAt);
			Objects.requireNonNull(privacyNoticeVersion);
			if (!privacyAccepted || !adultConfirmed || privacyNoticeVersion.isBlank() || privacyNoticeVersion.length() > 100) {
				throw new IllegalArgumentException("Required agreements must be accepted");
			}
		}
		@Override
		public String toString() {
			return "PreparedRegistration[redacted]";
		}
	}

	/** A committed pending registration, not authentication authority or a learner session. */
	public record Result(UUID accountId, long credentialVersion) { }
}
