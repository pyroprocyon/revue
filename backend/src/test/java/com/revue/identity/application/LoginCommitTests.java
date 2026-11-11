package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.revue.identity.domain.Account;
import com.revue.identity.domain.PasswordHash;
import com.revue.identity.domain.Username;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class LoginCommitTests {
    @Test
    void thePasswordProvedBeforeCredentialChangeCannotEstablishNewerSession() {
        var now = Instant.parse("2026-11-09T00:00:00Z");
        var id = UUID.randomUUID();
        Account account = new Account(
            id,
            null,
            now,
            null,
            null,
            1,
            false,
            now,
            "pilot-v1",
            now,
            null,
            new Username("student"));
        AccountQueries accounts = mock(AccountQueries.class);
        when(accounts.lock(id))
            .thenReturn(Optional.of(new AccountQueries.Credentials(account, new PasswordHash("{test}encoded"))));
        var commit = new LoginCommit(accounts, Clock.fixed(now, ZoneOffset.UTC));
        assertThatThrownBy(() -> commit.confirm(id, 0)).isInstanceOf(AccountProblem.class);
    }
}
