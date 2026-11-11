package com.revue.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.revue.identity.application.AccountProblem;
import com.revue.identity.application.AuthenticationAttemptStore;
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
        when(store.tryAcquire(anyString())).thenReturn(true);
        var first = admission.enter("first");
        assertThatThrownBy(() -> admission.enter("second")).isInstanceOf(AccountProblem.class);
        verify(store, times(1)).tryAcquire(anyString());
        first.close();
        first.close();
        try (var _ = admission.enter("second")) {
            assertThatThrownBy(() -> admission.enter("third")).isInstanceOf(AccountProblem.class);
        }
        verify(store, never()).tryAcquire("first");
    }

    @Test
    void sharedRejectionAndDatabaseFailureReleaseTheLocalPermit() {
        when(store.tryAcquire(anyString())).thenReturn(false)
            .thenThrow(new DataAccessResourceFailureException("offline"))
            .thenReturn(true);
        assertThatThrownBy(() -> admission.enter("first")).isInstanceOf(AccountProblem.class);
        assertThatThrownBy(() -> admission.enter("first")).isInstanceOf(AccountProblem.class);
        try (var _ = admission.enter("first")) {
            /* The third attempt can acquire local capacity. */
        }
    }
}
