package com.revue.identity.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Independent facts, with eligibility derived rather than stored as a competing status. */
public record Account(UUID id, EmailAddress email, Instant createdAt, @Nullable Instant emailVerifiedAt,
		@Nullable Instant suspendedAt, long credentialVersion, boolean credentialResetRequired,
		@Nullable Instant privacyAcceptedAt, @Nullable String privacyNoticeVersion,
		@Nullable Instant adultConfirmedAt, @Nullable DeletionRequest deletion) {
	public static final Duration REGISTRATION_LIFETIME = Duration.ofDays(7);

	public Account {
		Objects.requireNonNull(id);
		Objects.requireNonNull(email);
		Objects.requireNonNull(createdAt);
		if (credentialVersion < 0) {
			throw new IllegalArgumentException("Invalid credential version");
		}
		if ((privacyAcceptedAt == null) != (privacyNoticeVersion == null)
				|| (privacyNoticeVersion != null && (privacyNoticeVersion.isBlank() || privacyNoticeVersion.length() > 100))) {
			throw new IllegalArgumentException("Privacy acceptance requires a notice version");
		}
	}

	public static Account register(UUID id, EmailAddress email, String privacyVersion, Instant now) {
		Objects.requireNonNull(privacyVersion);
		return new Account(id, email, now, null, null, 0, false, now, privacyVersion, now, null);
	}

	public Access accessAt(Instant now) {
		Objects.requireNonNull(now);
		if (deletion != null) {
			return Access.DELETION_PENDING;
		}
		if (suspendedAt != null) {
			return Access.SUSPENDED;
		}
		if (emailVerifiedAt == null) {
			return registrationExpiredAt(now) ? Access.REGISTRATION_EXPIRED : Access.EMAIL_UNVERIFIED;
		}
		if (privacyAcceptedAt == null || adultConfirmedAt == null) {
			return Access.AGREEMENTS_REQUIRED;
		}
		if (credentialResetRequired) {
			return Access.CREDENTIAL_RESET_REQUIRED;
		}
		return Access.ACTIVE;
	}

	public Account scheduleDeletion(UUID requestId, Instant now) {
		if (deletion != null) {
			return this;
		}
		if (now.isBefore(createdAt)) {
			throw new IllegalArgumentException("Deletion predates registration");
		}
		return withDeletion(DeletionRequest.schedule(requestId, now));
	}

	/** Caller must first authenticate the proof and hold the account lock. Version alone is not proof. */
	public Account cancelDeletion(UUID requestId, long proofVersion, Instant now) {
		if (deletion == null || !deletion.id().equals(requestId) || proofVersion != credentialVersion
				|| now.isBefore(deletion.requestedAt()) || !now.isBefore(deletion.purgeAfter())) {
			throw new IllegalStateException("Deletion cannot be cancelled");
		}
		return withDeletion(null);
	}

	public boolean purgeEligibleAt(Instant now) {
		return deletion != null ? !now.isBefore(deletion.purgeAfter()) : registrationExpiredAt(now);
	}

	private boolean registrationExpiredAt(Instant now) {
		return emailVerifiedAt == null && !now.isBefore(createdAt.plus(REGISTRATION_LIFETIME));
	}

	private Account withDeletion(@Nullable DeletionRequest request) {
		return new Account(id, email, createdAt, emailVerifiedAt, suspendedAt,
			Math.incrementExact(credentialVersion), credentialResetRequired,
			privacyAcceptedAt, privacyNoticeVersion, adultConfirmedAt, request);
	}

	public enum Access {
		ACTIVE, DELETION_PENDING, SUSPENDED, EMAIL_UNVERIFIED, REGISTRATION_EXPIRED,
		AGREEMENTS_REQUIRED, CREDENTIAL_RESET_REQUIRED
	}
}
