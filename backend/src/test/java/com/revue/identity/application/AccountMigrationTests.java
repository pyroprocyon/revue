package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.revue.TestcontainersConfiguration;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "revue.content.load-on-startup=false")
@Import(TestcontainersConfiguration.class)
class AccountMigrationTests {
    @Autowired
    DataSource dataSource;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void upgradesExistingCatalogAndSessionDataWithoutChangingThem() {
        String schema = "upgrade_" + UUID.randomUUID().toString().replace("-", "");
        Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("3").load().migrate();
        jdbc.update(
            "insert into " + schema + ".sets (id, set_key, title, description, publisher_name, subject, "
                + "created_at, updated_at) " + "values (1, 'existing', 'Existing set', 'Description', 'Author', "
                + "'Japanese', now(), now())");
        jdbc.update(
            "insert into " + schema + ".cards (set_id, content_key, position, question, answer, "
                + "key_ideas, content_version, created_at, updated_at) "
                + "values (1, 'existing-card', 0, 'Question', 'Answer', ARRAY['Key " + "idea'], 3, now(), now())");
        String session = UUID.randomUUID().toString();
        jdbc.update(
            "insert into " + schema + ".spring_session (primary_id, session_id, creation_time, "
                + "last_access_time, max_inactive_interval, expiry_time) " + "values (?, ?, 1, 1, 1800, 1800001)",
            session,
            session);
        var setBefore = jdbc.queryForMap("select * from " + schema + ".sets where id = 1");
        var cardBefore = jdbc.queryForMap(
            "select row_to_json(c)::text as card from " + schema + ".cards c where content_key = 'existing-card'");
        var sessionBefore = jdbc
            .queryForMap("select * from " + schema + ".spring_session where primary_id = ?", session);

        var migration = Flyway.configure()
            .dataSource(dataSource)
            .schemas(schema)
            .defaultSchema(schema)
            .load()
            .migrate();

        assertThat(migration.migrationsExecuted).isEqualTo(3);
        assertThat(jdbc.queryForMap("select * from " + schema + ".sets where id = 1")).isEqualTo(setBefore);
        assertThat(
            jdbc.queryForMap(
                "select row_to_json(c)::text as card from " + schema + ".cards c where content_key = 'existing-card'"))
            .isEqualTo(cardBefore);
        assertThat(jdbc.queryForMap("select * from " + schema + ".spring_session where primary_id = ?", session))
            .isEqualTo(sessionBefore);
        assertThat(jdbc.queryForObject("select count(*) from " + schema + ".users", Integer.class)).isZero();
    }

    @Test
    void databaseRejectsPartialDeletionAndInvalidCredentialOrAgreementState() {
        UUID id = UUID.randomUUID();
        jdbc.update(
            "insert into users (id, email, password_hash, created_at) values " + "(?, ?, '{test}encoded', now())",
            id,
            id + "@example.com");
        for (String invalid : new String[] {"deletion_request_id = '00000000-0000-0000-0000-000000000001'",
            "deletion_requested_at = now(), purge_after = now() + interval '7 days'",
            "deletion_request_id = '00000000-0000-0000-0000-000000000001', "
                + "deletion_requested_at = now(), purge_after = now()",
            "credential_version = -1", "privacy_accepted_at = now()", "email = 'Upper@Example.com'"}) {
            assertThatThrownBy(() -> jdbc.update("update users set " + invalid + " where id = ?", id))
                .isInstanceOf(DataIntegrityViolationException.class);
        }
    }
}
