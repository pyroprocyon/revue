package com.revue.identity.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class UsernamePolicyTests {
    @Test
    void usernamesHaveOneCaseInsensitiveAsciiKey() {
        assertThat(new Username("  Kanji_Student  ").value()).isEqualTo("kanji_student");
        for (String invalid : new String[] {"ab", "a".repeat(33), "two words", "Kanji", "a@example.com"}) {
            assertThatIllegalArgumentException().isThrownBy(() -> new Username(invalid));
        }
    }

    @Test
    void sixCharactersAreEnoughWithoutCompositionRules() {
        PasswordPolicy.validate("kanjii");
        PasswordPolicy.validate(" " + "a".repeat(5));
        PasswordPolicy.validate("語".repeat(64));
        PasswordPolicy.validate("😀".repeat(6));
        for (String invalid : new String[] {"five!", "a".repeat(65), "123456", "password", "\ud800abcde"}) {
            assertThatIllegalArgumentException().isThrownBy(() -> PasswordPolicy.validate(invalid));
        }
    }

    @Test
    void usernameAccountsNeedNoEmailAndNeverExpireAsUnverifiedRegistrations() {
        Instant now = Instant.parse("2026-11-09T00:00:00Z");
        Account account = Account.registerUsername(UUID.randomUUID(), new Username("kanji_student"), "pilot-v1", now);
        assertThat(account.email()).isNull();
        assertThat(account.emailVerifiedAt()).isNull();
        assertThat(account.accessAt(now.plus(Duration.ofDays(30)))).isEqualTo(Account.Access.ACTIVE);
        assertThat(account.purgeEligibleAt(now.plus(Duration.ofDays(30)))).isFalse();
        Account scheduled = account.scheduleDeletion(UUID.randomUUID(), now);
        assertThat(scheduled.username()).isEqualTo(account.username());
        assertThat(scheduled.cancelDeletion(scheduled.deletion().id(), 1, now.plusSeconds(1)).username())
                .isEqualTo(account.username());
    }
}
