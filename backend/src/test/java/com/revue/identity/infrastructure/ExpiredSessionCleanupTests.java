package com.revue.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.revue.StructuredEvents;
import com.revue.TestcontainersConfiguration;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;

@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(properties = {"spring.datasource.hikari.maximum-pool-size=1",
    "spring.datasource.hikari.connection-timeout=250"})
@Import(TestcontainersConfiguration.class)
class ExpiredSessionCleanupTests {
    @Autowired
    private DataSource dataSource;

    @Autowired
    private ExpiredSessionCleanup cleanup;

    @Test
    void exhaustedPoolRecordsCleanupFailuresAndAllowsLaterRetry(CapturedOutput output) throws Exception {
        try (var _ = dataSource.getConnection()) {
            cleanup.deleteAtStartup();
            cleanup.deleteDaily();
        }
        var failures = StructuredEvents.named(output, "session.cleanup")
            .stream()
            .filter(event -> "failure".equals(event.at("/event/outcome").asString()))
            .toList();
        assertThat(failures).extracting(event -> event.at("/job/trigger").asString())
            .containsExactly("startup", "scheduled");
        assertThat(failures).allSatisfy(event -> {
            assertThat(event.at("/event/reason").asString()).isEqualTo("CannotCreateTransactionException");
            assertThat(event.at("/error/cause_type").asString()).isEqualTo("SQLTransientConnectionException");
            assertThat(event.at("/operation/id").asString()).isNotBlank();
        });

        cleanup.deleteDaily();
        assertThat(StructuredEvents.named(output, "session.cleanup")).last().satisfies(event -> {
            assertThat(event.at("/event/outcome").asString()).isEqualTo("success");
            assertThat(event.at("/job/trigger").asString()).isEqualTo("scheduled");
        });
    }
}
