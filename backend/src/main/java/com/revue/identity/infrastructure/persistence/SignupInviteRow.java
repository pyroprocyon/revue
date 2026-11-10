package com.revue.identity.infrastructure.persistence;

import com.revue.identity.domain.SignupInvite;
import com.revue.identity.domain.TokenHash;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

@Entity(name = "SignupInvite")
@Table(name = "signup_invites")
class SignupInviteRow {
    @Id private UUID id;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private @Nullable Instant revokedAt;

    @Column(name = "redeemed_at")
    private @Nullable Instant redeemedAt;

    @Column(name = "redeemed_by_user_id")
    private @Nullable UUID redeemedByUserId;

    @Column(nullable = false)
    private boolean reusable;

    protected SignupInviteRow() {}

    SignupInvite toDomain() {
        return new SignupInvite(
                id, new TokenHash(tokenHash), createdAt, expiresAt, revokedAt, redeemedAt, redeemedByUserId, reusable);
    }

    void recordRedemption(SignupInvite invite) {
        redeemedAt = invite.redeemedAt();
        redeemedByUserId = invite.redeemedByUserId();
    }
}
