package com.revue.content.infrastructure.files;

import static org.assertj.core.api.Assertions.assertThat;

import com.revue.TestcontainersConfiguration;
import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.SetDefinition;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** The explicit publication job loads the bundled source in file order. */
@SpringBootTest(properties = "revue.content.publish=true")
@Import(TestcontainersConfiguration.class)
class PublicContentPublicationTests {

    @Autowired
    private JdbcTemplate jdbc;

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
}
