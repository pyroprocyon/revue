package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.SignupInvite;
import com.revue.identity.domain.TokenHash;
import com.revue.identity.domain.Username;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class RegistrationCommitUnitTests {
    @Test
    void lockWaitDoesNotExtendInviteValidity() {
        Instant expires = Instant.parse("2026-11-09T00:00:00Z");
        TokenHash hash = new TokenHash("a".repeat(64));
        SignupInvite invite = new SignupInvite(
            UUID.randomUUID(),
            hash,
            expires.minusSeconds(60),
            expires,
            null,
            null,
            null,
            false);
        var time = new AtomicReference<>(expires.minusSeconds(1));
        RegistrationStore store = mock(RegistrationStore.class);
        when(store.currentTime()).thenAnswer(ignored -> time.get());
        when(store.lockInvite(hash)).thenAnswer(ignored -> {
            time.set(expires); // The transaction acquired its lock only after the invite expired.
            return Optional.of(invite);
        });
        var command = new RegistrationCommit.UsernameRegistration(
            new Username("student"),
            new PasswordHash("{test}encoded-placeholder"),
            hash);
        assertThatThrownBy(() -> new RegistrationCommit(store, new PilotInvitation("")).registerUsername(command))
            .isInstanceOf(RegistrationUnavailableException.class);
        verify(store, never()).insertUsernameAccount(any(), any());
        verify(store, never()).saveRedemption(any());
    }
}
