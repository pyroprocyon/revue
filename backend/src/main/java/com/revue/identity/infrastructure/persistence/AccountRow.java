package com.revue.identity.infrastructure.persistence;

import com.revue.identity.application.AccountQueries;
import com.revue.identity.domain.Account;
import com.revue.identity.domain.DeletionRequest;
import com.revue.identity.domain.EmailAddress;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.Username;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

@Entity(name = "Account")
@Table(name = "users")
class AccountRow {
    @Id private UUID id;

    @Column private @Nullable String email;

    @Column(length = 32)
    private @Nullable String username;

    @Column(name = "password_hash", nullable = false, length = 1024)
    private String passwordHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "email_verified_at")
    private @Nullable Instant emailVerifiedAt;

    @Column(name = "suspended_at")
    private @Nullable Instant suspendedAt;

    @Column(name = "credential_version", nullable = false)
    private long credentialVersion;

    @Column(name = "credential_reset_required", nullable = false)
    private boolean resetRequired;

    @Column(name = "privacy_accepted_at")
    private @Nullable Instant privacyAcceptedAt;

    @Column(name = "privacy_notice_version", length = 100)
    private @Nullable String privacyVersion;

    @Column(name = "adult_confirmed_at")
    private @Nullable Instant adultConfirmedAt;

    @Column(name = "deletion_request_id")
    private @Nullable UUID deletionId;

    @Column(name = "deletion_requested_at")
    private @Nullable Instant deletionRequestedAt;

    @Column(name = "purge_after")
    private @Nullable Instant purgeAfter;

    protected AccountRow() {}

    AccountQueries.Credentials toCredentials() {
        DeletionRequest deletion =
                deletionId == null ? null : new DeletionRequest(deletionId, deletionRequestedAt, purgeAfter);
        Account account =
                new Account(
                        id,
                        email == null ? null : new EmailAddress(email),
                        createdAt,
                        emailVerifiedAt,
                        suspendedAt,
                        credentialVersion,
                        resetRequired,
                        privacyAcceptedAt,
                        privacyVersion,
                        adultConfirmedAt,
                        deletion,
                        username == null ? null : new Username(username));
        return new AccountQueries.Credentials(account, new PasswordHash(passwordHash));
    }
}
