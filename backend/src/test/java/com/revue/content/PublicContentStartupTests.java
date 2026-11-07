package com.revue.content;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.revue.TestcontainersConfiguration;

/**
 * Starting the app loads the public set files into the database, so the starter set exists
 * without any manual step after a deploy.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class PublicContentStartupTests {

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void startupLoadsTheStarterSetWithItsCardsInFileOrder() {
		List<String> expectedKeys = PublicContent.readAndCheck()
			.stream()
			.filter(set -> set.setKey().equals("human-body-brain"))
			.findFirst()
			.orElseThrow()
			.cards()
			.stream()
			.map(CardFile::key)
			.toList();

		List<String> loadedKeys = jdbc.queryForList("SELECT c.content_key FROM cards c JOIN sets s ON s.id = c.set_id"
				+ " WHERE s.set_key = 'human-body-brain' AND s.retired_at IS NULL AND c.retired_at IS NULL"
				+ " ORDER BY c.position, c.id", String.class);

		assertThat(loadedKeys).isEqualTo(expectedKeys);
	}

}
