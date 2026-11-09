package com.revue.identity.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AccountRulesTests {
	private static final Instant NOW = Instant.parse("2026-11-09T00:00:00Z");

	@Test
	void emailUsesOneCanonicalKeyWithoutRemovingAliases() {
		assertThat(new EmailAddress(" \tStudent.Name+Kanji@Example.COM\r\n").value())
			.isEqualTo("student.name+kanji@example.com");
		for (String invalid : new String[] {"a..b@example.com", ".a@example.com", "a@-example.com",
				"a@example..com", "a b@example.com", "a@example.com\u0000", "é@example.com"}) {
			assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress(invalid));
		}
		assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress("x".repeat(65) + "@example.com"));
	}

	@Test
	void canonicalEmailPreservesTheSupportedSyntaxAndBounds() {
		String local = "a".repeat(64);
		assertThat(new EmailAddress(" \t\n\u000b\f\r" + local + "@example.com \t\n\u000b\f\r").value())
			.isEqualTo(local + "@example.com");
		assertThat(new EmailAddress("!#$%&'*+-/=?^_`{|}~.student@example.com").value())
			.isEqualTo("!#$%&'*+-/=?^_`{|}~.student@example.com");
		for (String invalid : new String[] {"a.@example.com", "a\t@example.com", "\u0000a@example.com",
				"a@example.com\u001f", "\u00a0a@example.com", "K@example.com", "a@" + "b".repeat(64) + ".com",
				" ".repeat(1025)}) {
			assertThatIllegalArgumentException().isThrownBy(() -> new EmailAddress(invalid));
		}
	}

	@Test
	void eligibilityKeepsIndependentRestrictions() {
		Account pending = account(null, null, false, null);
		assertThat(pending.accessAt(NOW)).isEqualTo(Account.Access.EMAIL_UNVERIFIED);
		assertThat(pending.accessAt(NOW.plus(Duration.ofDays(7)))).isEqualTo(Account.Access.REGISTRATION_EXPIRED);
		assertThat(account(NOW, null, false, null).accessAt(NOW)).isEqualTo(Account.Access.ACTIVE);
		assertThat(account(NOW, NOW, true, null).accessAt(NOW)).isEqualTo(Account.Access.SUSPENDED);
		assertThat(account(NOW, null, true, null).accessAt(NOW)).isEqualTo(Account.Access.CREDENTIAL_RESET_REQUIRED);
		Account missingAgreements = new Account(UUID.randomUUID(), new EmailAddress("a@example.com"), NOW,
			NOW, null, 0, false, null, null, null, null);
		assertThat(missingAgreements.accessAt(NOW)).isEqualTo(Account.Access.AGREEMENTS_REQUIRED);
	}

	@Test
	void eitherMissingAgreementPreventsOrdinaryAccess() {
		Account missingPrivacy = new Account(UUID.randomUUID(), new EmailAddress("student@example.com"), NOW,
			NOW, null, 0, false, null, null, NOW, null);
		Account missingAdultConfirmation = new Account(UUID.randomUUID(), new EmailAddress("student@example.com"), NOW,
			NOW, null, 0, false, NOW, "pilot-v1", null, null);

		assertThat(missingPrivacy.accessAt(NOW)).isEqualTo(Account.Access.AGREEMENTS_REQUIRED);
		assertThat(missingAdultConfirmation.accessAt(NOW)).isEqualTo(Account.Access.AGREEMENTS_REQUIRED);
	}

	@Test
	void repeatedDeletionDoesNotExtendDeadlineOrIncrementVersion() {
		Account initial = account(NOW, null, false, null);
		UUID request = UUID.randomUUID();
		Account scheduled = initial.scheduleDeletion(request, NOW);
		assertThat(scheduled.credentialVersion()).isEqualTo(1);
		assertThat(scheduled.deletion().purgeAfter()).isEqualTo(NOW.plus(Duration.ofDays(7)));
		assertThat(scheduled.scheduleDeletion(UUID.randomUUID(), NOW.plusSeconds(60))).isEqualTo(scheduled);
		assertThat(scheduled.accessAt(NOW)).isEqualTo(Account.Access.DELETION_PENDING);
		assertThat(scheduled.purgeEligibleAt(NOW.plus(Duration.ofDays(7)))).isTrue();
	}

	@Test
	void cancellationRequiresCurrentRequestAndVersionAndPreservesOtherFacts() {
		Account restricted = account(null, NOW, true, null).scheduleDeletion(UUID.randomUUID(), NOW);
		assertThatIllegalStateException().isThrownBy(() -> restricted.cancelDeletion(UUID.randomUUID(), 1, NOW));
		assertThatIllegalStateException().isThrownBy(() -> restricted.cancelDeletion(restricted.deletion().id(), 0, NOW));
		Account cancelled = restricted.cancelDeletion(restricted.deletion().id(), 1, NOW.plusSeconds(1));
		assertThat(cancelled.deletion()).isNull();
		assertThat(cancelled.credentialVersion()).isEqualTo(2);
		assertThat(cancelled.emailVerifiedAt()).isNull();
		assertThat(cancelled.suspendedAt()).isEqualTo(NOW);
		assertThat(cancelled.credentialResetRequired()).isTrue();
		assertThat(cancelled.accessAt(NOW)).isEqualTo(Account.Access.SUSPENDED);
		assertThatIllegalStateException().isThrownBy(() -> restricted.cancelDeletion(
			restricted.deletion().id(), 1, restricted.deletion().purgeAfter()));
	}

	@Test
	void deletionWindowTakesPrecedenceOverUnverifiedCleanup() {
		Account scheduled = account(null, null, false, null)
			.scheduleDeletion(UUID.randomUUID(), NOW.plus(Duration.ofDays(6)));
		assertThat(scheduled.purgeEligibleAt(NOW.plus(Duration.ofDays(7)))).isFalse();
		assertThat(scheduled.purgeEligibleAt(NOW.plus(Duration.ofDays(13)))).isTrue();
		Account cancelled = scheduled.cancelDeletion(scheduled.deletion().id(), 1, NOW.plus(Duration.ofDays(8)));
		assertThat(cancelled.accessAt(NOW.plus(Duration.ofDays(8)))).isEqualTo(Account.Access.REGISTRATION_EXPIRED);
	}

	@Test
	void invitationsAreSingleUseAndExpireAtTheDeadline() {
		SignupInvite invite = new SignupInvite(UUID.randomUUID(), new TokenHash("a".repeat(64)), NOW,
			NOW.plusSeconds(60), null, null, null);
		assertThat(invite.redeem(UUID.randomUUID(), NOW).redeemedAt()).isEqualTo(NOW);
		assertThatIllegalStateException().isThrownBy(() -> invite.redeem(UUID.randomUUID(), NOW.plusSeconds(60)));
		assertThatIllegalStateException().isThrownBy(() -> invite.redeem(UUID.randomUUID(), NOW.minusSeconds(1)));
		SignupInvite detached = new SignupInvite(invite.id(), invite.tokenHash(), NOW,
			invite.expiresAt(), null, NOW, null);
		assertThatIllegalStateException().isThrownBy(() -> detached.redeem(UUID.randomUUID(), NOW));
		SignupInvite revoked = new SignupInvite(invite.id(), invite.tokenHash(), NOW,
			invite.expiresAt(), NOW, null, null);
		assertThatIllegalStateException().isThrownBy(() -> revoked.redeem(UUID.randomUUID(), NOW));
	}

	@Test
	void sensitiveValuesDoNotAppearInDiagnosticStrings() {
		assertThat(new EmailAddress("private@example.com").toString()).doesNotContain("private@example.com");
		assertThat(new TokenHash("b".repeat(64)).toString()).doesNotContain("b".repeat(64));
		assertThat(new PasswordHash("{test}encoded-test-value").toString()).doesNotContain("encoded-test-value");
	}

	private Account account(Instant verified, Instant suspended, boolean reset, DeletionRequest deletion) {
		return new Account(UUID.randomUUID(), new EmailAddress("student@example.com"), NOW, verified,
			suspended, 0, reset, NOW, "pilot-v1", NOW, deletion);
	}
}
