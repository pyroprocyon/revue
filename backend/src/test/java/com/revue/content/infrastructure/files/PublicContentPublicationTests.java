package com.revue.content.infrastructure.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.revue.StructuredEvents;
import com.revue.TestcontainersConfiguration;
import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.SetDefinition;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** The explicit publication job loads the bundled source in file order. */
@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(properties = "revue.content.publish=true")
@Import(TestcontainersConfiguration.class)
class PublicContentPublicationTests {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PublicContentPublication publication;

    @Test
    void explicitJobLoadsEveryPublicSetWithItsCardsInFileOrder() {
        List<SetDefinition> setFiles = PublicContent.readAndCheck();

        for (SetDefinition setFile : setFiles) {
            List<String> expectedKeys = setFile.cards().stream().map(CardDefinition::key).toList();
            List<String> loadedKeys = jdbc.queryForList(
                "SELECT c.content_key FROM cards c JOIN sets s ON s.id = c.set_id"
                    + " WHERE s.set_key = ? AND s.retired_at IS NULL AND c.retired_at IS NULL"
                    + " ORDER BY c.position, c.id",
                String.class,
                setFile.setKey());
            assertThat(loadedKeys).as(setFile.setKey()).isEqualTo(expectedKeys);
        }
    }

    @Test
    void publicationJobCorrelatesNoChangeAndFailureWithTheirStarts(CapturedOutput output) throws Exception {
        final var committedBefore = StructuredEvents.named(output, "catalog.published");
        var arguments = new DefaultApplicationArguments();
        publication.run(arguments);
        assertThat(StructuredEvents.named(output, "catalog.publication_skipped")).singleElement().satisfies(event -> {
            assertThat(event.at("/event/outcome").asString()).isEqualTo("no_change");
            assertThat(event.at("/operation/id").asString()).isEqualTo(latestStartId(output)).isNotBlank();
        });

        String firstOperation = latestStartId(output);
        jdbc.update("UPDATE catalog_publication SET revision = revision + 1");
        try {
            assertThatThrownBy(() -> publication.run(arguments)).isInstanceOf(IllegalStateException.class);
        } finally {
            jdbc.update("UPDATE catalog_publication SET revision = revision - 1");
        }
        assertThat(StructuredEvents.named(output, "catalog.publication_failed")).singleElement().satisfies(event -> {
            assertThat(event.at("/event/outcome").asString()).isEqualTo("failure");
            assertThat(event.at("/operation/id").asString()).isEqualTo(latestStartId(output))
                .isNotBlank()
                .isNotEqualTo(firstOperation);
        });
        assertThat(StructuredEvents.named(output, "catalog.published")).isEqualTo(committedBefore);
    }

    private static String latestStartId(CapturedOutput output) {
        var start = StructuredEvents.named(output, "catalog.publication_started").getLast();
        assertThat(start.at("/event/outcome").asString()).isEqualTo("started");
        return start.at("/operation/id").asString();
    }
}
