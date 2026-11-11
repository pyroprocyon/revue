package com.revue.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.revue.TestcontainersConfiguration;
import com.revue.identity.application.AccountProblem;
import com.revue.identity.application.AuthenticationAttemptStore;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class SharedAuthenticationAdmissionTests {
    @Autowired
    private AuthenticationAttemptStore store;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PlatformTransactionManager transactions;

    @BeforeEach
    void clearAttempts() {
        jdbc.update("DELETE FROM authentication_attempts");
    }

    @Test
    void replicasAndReplacementInstancesShareTenAttemptsAndDatabaseExpiry() {
        var first = replica();
        var second = replica();
        for (int i = 0; i < 10; i++) {
            try (var permit = (i % 2 == 0 ? first : second).enter("same-learner")) {
            }
        }
        assertThatThrownBy(() -> replica().enter("same-learner")).isInstanceOf(AccountProblem.class);
        assertThat(jdbc.queryForObject("SELECT attempts FROM authentication_attempts", Integer.class)).isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT identifier_hash FROM authentication_attempts", String.class))
            .matches("[0-9a-f]{64}");
        jdbc.update("UPDATE authentication_attempts SET expires_at = clock_timestamp() - interval '1 second'");
        try (var permit = second.enter("same-learner")) {
        }
        assertThat(jdbc.queryForObject("SELECT attempts FROM authentication_attempts", Integer.class)).isEqualTo(1);
    }

    @Test
    void storageHasHardBoundAndExpiredEntriesFreeCapacity() {
        jdbc.update(
            "INSERT INTO authentication_attempts SELECT md5(n::text) || md5(n::text), 1, clock_timestamp() +"
                + " interval '1 minute' FROM generate_series(1, 1024) n");
        assertThat(store.tryAcquire("a".repeat(64))).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM authentication_attempts", Integer.class)).isEqualTo(1024);
        jdbc.update("UPDATE authentication_attempts SET expires_at = clock_timestamp() - interval '1 second'");
        assertThat(store.tryAcquire("a".repeat(64))).isTrue();
    }

    @Test
    void busySharedCounterRejectsWithoutWaiting() {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(1919252085, 1)", Boolean.class);
            long start = System.nanoTime();
            assertThat(store.tryAcquire("b".repeat(64))).isFalse();
            assertThat((System.nanoTime() - start) / 1_000_000).isLessThan(1000);
        });
    }

    private BoundedAuthenticationAdmission replica() {
        return new BoundedAuthenticationAdmission(store, new SimpleMeterRegistry());
    }
}
