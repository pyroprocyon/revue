package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.revue.identity.domain.EmailAddress;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.SignupInvite;
import com.revue.identity.domain.TokenHash;
import java.time.Clock;
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
        SignupInvite invite =
                new SignupInvite(UUID.randomUUID(), hash, expires.minusSeconds(60), expires, null, null, null);
        var time = new AtomicReference<>(expires.minusSeconds(1));
        Clock clock = mock(Clock.class);
        when(clock.instant()).thenAnswer(ignored -> time.get());
        RegistrationStore store = mock(RegistrationStore.class);
        when(store.lockInvite(hash))
                .thenAnswer(
                        ignored -> {
                            time.set(expires); // The transaction acquired its lock only after the invite expired.
                            return Optional.of(invite);
                        });
        var command = input(hash, expires.plusSeconds(300), true, true);
        assertThatThrownBy(() -> new RegistrationCommit(store, clock).register(command))
                .isInstanceOf(RegistrationUnavailableException.class);
        verify(store, never()).insertPendingAccount(any(), any());
    }

    @Test
    void missingRequiredAgreementsCannotReachRegistration() {
        TokenHash hash = new TokenHash("a".repeat(64));
        assertThatIllegalArgumentException().isThrownBy(() -> input(hash, Instant.now(), false, true));
        assertThatIllegalArgumentException().isThrownBy(() -> input(hash, Instant.now(), true, false));
    }

    private RegistrationCommit.PreparedRegistration input(
            TokenHash hash, Instant expires, boolean privacy, boolean adult) {
        return new RegistrationCommit.PreparedRegistration(
                new EmailAddress("student@example.com"),
                new PasswordHash("{test}encoded-placeholder"),
                hash,
                new TokenHash("b".repeat(64)),
                expires,
                "pilot-v1",
                privacy,
                adult);
    }
}
