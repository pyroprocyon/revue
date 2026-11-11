package com.revue.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.revue.identity.application.AccountProblem;
import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PilotAuthenticationAdmissionTests {
    private final Instant start = Instant.parse("2026-11-10T00:00:00Z");
    private final Clock clock = mock(Clock.class);
    private final PilotAuthenticationAdmission admission = new PilotAuthenticationAdmission(clock);

    @BeforeEach
    void setTime() {
        when(clock.instant()).thenReturn(start);
    }

    @Test
    void overlappingOperationsAreRejectedWithoutWaitingOrSpendingTheirAttemptBudget() throws Exception {
        try (java.util.concurrent.ExecutorService executor = Executors.newSingleThreadExecutor();
            var permit = admission.enter("first")) {
            executor.submit(() -> {
                for (int i = 0; i < 12; i++) {
                    assertOverloaded("second");
                }
            }).get(5, TimeUnit.SECONDS);
        }
        for (int i = 0; i < 10; i++) {
            attempt("second");
        }
        assertOverloaded("second");
    }

    @Test
    void tenAttemptsShareOneFixedMinuteWindowPerIdentifier() {
        for (int i = 0; i < 10; i++) {
            attempt("learner");
        }
        assertOverloaded("learner");
        attempt("another");
        when(clock.instant()).thenReturn(start.plusSeconds(60).minusNanos(1));
        assertOverloaded("learner");
        when(clock.instant()).thenReturn(start.plusSeconds(60));
        attempt("learner");
    }

    @Test
    void identifierStorageIsBoundedAndExpiredEntriesFreeCapacity() {
        for (int i = 0; i < 1024; i++) {
            attempt("learner" + i);
        }
        assertOverloaded("newcomer");
        attempt("learner0");
        when(clock.instant()).thenReturn(start.plusSeconds(60));
        attempt("newcomer");
    }

    @Test
    void closingAnOperationAfterFailureAllowsTheNextOperation() {
        assertThatThrownBy(() -> {
            try (var permit = admission.enter("first")) {
                throw new IllegalStateException("Downstream authentication failed");
            }
        }).isInstanceOf(IllegalStateException.class);
        attempt("second");
    }

    private void attempt(String key) {
        try (var permit = admission.enter(key)) {
            // Closing the admitted operation releases capacity immediately.
        }
    }

    private void assertOverloaded(String key) {
        assertThatThrownBy(() -> admission.enter(key)).isInstanceOfSatisfying(
            AccountProblem.class,
            problem -> assertThat(problem.kind()).isEqualTo(AccountProblem.Kind.OVERLOADED));
    }
}
