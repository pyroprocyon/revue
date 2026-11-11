package com.revue.content.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.revue.TestcontainersConfiguration;
import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.InvalidContentException;
import com.revue.content.domain.SetDefinition;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
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
class CatalogPublisherTests {
    @Autowired
    private CatalogPublisher publisher;
    @Autowired
    private PublicationState state;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PlatformTransactionManager transactions;
    private static final String DIGEST = "a".repeat(64);

    @BeforeEach
    void resetRevision() {
        jdbc.update("UPDATE catalog_publication SET revision = 0, digest = ''");
    }

    @Test
    void retryIsNoOpAndOldOrReusedRevisionsCannotOverwriteContent() {
        assertThat(publisher.publish(2, DIGEST, source("Published"))).isTrue();
        var updated = jdbc.queryForObject("SELECT updated_at FROM sets WHERE set_key = 'publisher-test'", Object.class);
        assertThat(publisher.publish(2, DIGEST, source("Published"))).isFalse();
        assertThatThrownBy(() -> publisher.publish(1, DIGEST, source("Old"))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> publisher.publish(2, "b".repeat(64), source("Changed")))
            .isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT updated_at FROM sets WHERE set_key = 'publisher-test'", Object.class))
            .isEqualTo(updated);
    }

    @Test
    void failedPublicationRollsBackContentAndRevision() {
        publisher.publish(1, DIGEST, source("Published"));
        var invalid = new SetDefinition("invalid", "invalid", "", "", "", "", List.of());
        assertThatThrownBy(() -> publisher.publish(2, "b".repeat(64), List.of(source("Changed").getFirst(), invalid)))
            .isInstanceOf(InvalidContentException.class);
        assertThat(jdbc.queryForObject("SELECT revision FROM catalog_publication", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT title FROM sets WHERE set_key = 'publisher-test'", String.class))
            .isEqualTo("Published");
    }

    @Test
    void ownershipFailureAfterFlushingAnEarlierSetRollsBackTheWholePublication() {
        publisher.publish(1, DIGEST, source("Original"));
        var fresh = new SetDefinition(
            "new.yaml",
            "new-publisher-set",
            "New",
            "Description",
            "Publisher",
            "Subject",
            List.of(
                new CardDefinition(
                    "new-publisher-card",
                    "Question?",
                    "Answer",
                    List.of("Answer"),
                    null,
                    null,
                    "Source")));
        var moved = new SetDefinition(
            "moved.yaml",
            "moved-publisher-set",
            "Moved",
            "Description",
            "Publisher",
            "Subject",
            source("Original").getFirst().cards());
        assertThatThrownBy(() -> publisher.publish(2, "b".repeat(64), List.of(fresh, moved)))
            .isInstanceOf(InvalidContentException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sets WHERE set_key = 'new-publisher-set'", Integer.class))
            .isZero();
        assertThat(jdbc.queryForObject("SELECT revision FROM catalog_publication", Long.class)).isEqualTo(1);
    }

    @Test
    void competingPublisherReadsRevisionAfterTheFirstTransactionCommits() throws Exception {
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                state.lock();
                publisher.publish(3, DIGEST, source("Newest"));
                locked.countDown();
                try {
                    assertThat(release.await(3, TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(ex);
                }
            }));
            assertThat(locked.await(3, TimeUnit.SECONDS)).isTrue();
            var second = executor.submit(() -> publisher.publish(2, DIGEST, source("Older")));
            try {
                assertThatThrownBy(() -> second.get(100, TimeUnit.MILLISECONDS))
                    .isInstanceOf(java.util.concurrent.TimeoutException.class);
            } finally {
                release.countDown();
            }
            first.get(5, TimeUnit.SECONDS);
            assertThatThrownBy(() -> second.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(IllegalStateException.class);
        }
        assertThat(jdbc.queryForObject("SELECT title FROM sets WHERE set_key = 'publisher-test'", String.class))
            .isEqualTo("Newest");
    }

    private static List<SetDefinition> source(String title) {
        return List.of(
            new SetDefinition(
                "publisher.yaml",
                "publisher-test",
                title,
                "Description",
                "Publisher",
                "Subject",
                List.of(
                    new CardDefinition(
                        "publisher-card",
                        "Question?",
                        "Answer",
                        List.of("Answer"),
                        null,
                        null,
                        "Source"))));
    }
}
