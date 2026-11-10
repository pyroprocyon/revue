package com.revue.identity.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Independent facts, with eligibility derived rather than stored as a competing status. */
public record Account(
        UUID id,
        @Nullable EmailAddress email,
        Instant createdAt,
        @Nullable Instant emailVerifiedAt,
        @Nullable Instant suspendedAt,
        long credentialVersion,
        boolean credentialResetRequired,
        @Nullable Instant privacyAcceptedAt,
        @Nullable String privacyNoticeVersion,
        @Nullable Instant adultConfirmedAt,
        @Nullable DeletionRequest deletion,
        @Nullable Username username) {
    public static final Duration REGISTRATION_LIFETIME = Duration.ofDays(7);

    /** Validates the account identity, consent and lifecycle state. */
    public Account {
        Objects.requireNonNull(id);
        if (email == null && username == null) {
            throw new IllegalArgumentException("An account identifier is required");
        }
        Objects.requireNonNull(createdAt);
        if (credentialVersion < 0) {
            throw new IllegalArgumentException("Invalid credential version");
        }
        if ((privacyAcceptedAt == null) != (privacyNoticeVersion == null)
                || (privacyNoticeVersion != null
                        && (privacyNoticeVersion.isBlank() || privacyNoticeVersion.length() > 100))) {
            throw new IllegalArgumentException("Privacy acceptance requires a notice version");
        }
    }

    /** Creates an unverified email account with recorded pilot consent. */
    public static Account register(UUID id, @Nullable EmailAddress email, String privacyVersion, Instant now) {
        Objects.requireNonNull(privacyVersion);
        return new Account(id, email, now, null, null, 0, false, now, privacyVersion, now, null, null);
    }

    /** Creates an active username account with recorded pilot consent. */
    public static Account registerUsername(UUID id, Username username, String privacyVersion, Instant now) {
        Objects.requireNonNull(username);
        Objects.requireNonNull(privacyVersion);
        return new Account(id, null, now, null, null, 0, false, now, privacyVersion, now, null, username);
    }

    /** Determines whether the account may be used at the supplied time. */
    public Access accessAt(Instant now) {
        Objects.requireNonNull(now);
        if (deletion != null) {
            return Access.DELETION_PENDING;
        }
        if (suspendedAt != null) {
            return Access.SUSPENDED;
        }
        if (username == null && emailVerifiedAt == null) {
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

    /** Returns this account with its existing or newly scheduled deletion request. */
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
        if (deletion == null
                || !deletion.id().equals(requestId)
                || proofVersion != credentialVersion
                || now.isBefore(deletion.requestedAt())
                || !now.isBefore(deletion.purgeAfter())) {
            throw new IllegalStateException("Deletion cannot be cancelled");
        }
        return withDeletion(null);
    }

    /** Checks the deletion and abandoned-email-registration cleanup deadlines. */
    public boolean purgeEligibleAt(Instant now) {
        return deletion != null ? !now.isBefore(deletion.purgeAfter()) : registrationExpiredAt(now);
    }

    private boolean registrationExpiredAt(Instant now) {
        return username == null && emailVerifiedAt == null && !now.isBefore(createdAt.plus(REGISTRATION_LIFETIME));
    }

    private Account withDeletion(@Nullable DeletionRequest request) {
        return new Account(
                id,
                email,
                createdAt,
                emailVerifiedAt,
                suspendedAt,
                Math.incrementExact(credentialVersion),
                credentialResetRequired,
                privacyAcceptedAt,
                privacyNoticeVersion,
                adultConfirmedAt,
                request,
                username);
    }

    /** Account access decisions that are independent of HTTP and persistence. */
    public enum Access {
        ACTIVE,
        DELETION_PENDING,
        SUSPENDED,
        EMAIL_UNVERIFIED,
        REGISTRATION_EXPIRED,
        AGREEMENTS_REQUIRED,
        CREDENTIAL_RESET_REQUIRED
    }
}
