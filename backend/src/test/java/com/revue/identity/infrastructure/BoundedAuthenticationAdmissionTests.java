package com.revue.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.revue.identity.application.AccountProblem;
import com.revue.identity.application.AuthenticationAttemptStore;
import com.revue.identity.application.AuthenticationAttemptStore.Decision;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class BoundedAuthenticationAdmissionTests {
    private final AuthenticationAttemptStore store = mock(AuthenticationAttemptStore.class);
    private final BoundedAuthenticationAdmission admission = new BoundedAuthenticationAdmission(
        store,
        new SimpleMeterRegistry());

    @Test
    void localCapacityRejectsWithoutSpendingSharedAttemptsAndDoubleCloseDoesNotIncreaseCapacity() {
        when(store.tryAcquire(anyString())).thenReturn(Decision.ADMITTED);
        var first = admission.enter("first");
        assertRejected("second", AccountProblem.Kind.AUTHENTICATION_BUSY);
        verify(store, times(1)).tryAcquire(anyString());
        first.close();
        first.close();
        try (var _ = admission.enter("second")) {
            assertRejected("third", AccountProblem.Kind.AUTHENTICATION_BUSY);
        }
        verify(store, never()).tryAcquire("first");
    }

    @Test
    void sharedRejectionAndDatabaseFailureReleaseTheLocalPermit() {
        when(store.tryAcquire(anyString())).thenReturn(Decision.CONTENDED, Decision.EXHAUSTED)
            .thenThrow(new DataAccessResourceFailureException("offline"))
            .thenReturn(Decision.ADMITTED);
        assertRejected("first", AccountProblem.Kind.AUTHENTICATION_BUSY);
        assertRejected("first", AccountProblem.Kind.OVERLOADED);
        assertRejected("first", AccountProblem.Kind.OVERLOADED);
        try (var _ = admission.enter("first")) {
            assertRejected("second", AccountProblem.Kind.AUTHENTICATION_BUSY);
        }
    }

    private void assertRejected(String username, AccountProblem.Kind kind) {
        assertThatThrownBy(() -> admission.enter(username))
            .isInstanceOfSatisfying(AccountProblem.class, problem -> assertThat(problem.kind()).isEqualTo(kind));
    }
}
