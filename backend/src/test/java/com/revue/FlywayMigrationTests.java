package com.revue;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;

/**
 * Starts the whole app against PostgreSQL 18.6 in Docker. Startup runs every Flyway migration, so a broken migration
 * fails here before it can reach a real database.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class FlywayMigrationTests {

    @Autowired private JdbcTemplate jdbc;

    @Autowired private SessionRepository<? extends Session> sessions;

    @Test
    void runsAgainstThePinnedPostgresVersion() {
        String serverVersion = jdbc.queryForObject("SHOW server_version", String.class);

        assertThat(serverVersion).startsWith("18.6");
    }

    @Test
    void appliesTheSpringSessionMigration() {
        List<Map<String, Object>> applied =
                jdbc.queryForList(
                        "SELECT version, success FROM flyway_schema_history WHERE version "
                                + "IS NOT NULL ORDER BY installed_rank");

        assertThat(applied).extracting(row -> row.get("version")).contains("1");
        assertThat(applied).allSatisfy(row -> assertThat(row.get("success")).isEqualTo(true));
    }

    @Test
    void springSessionSavesAndReadsSessionsInTheMigratedTables() {
        // The JDBC store, not an in-memory one, so logins survive a backend restart.
        assertThat(sessions).isInstanceOf(JdbcIndexedSessionRepository.class);

        String sessionId = saveAndReload(sessions);

        Integer sessionRows =
                jdbc.queryForObject(
                        "SELECT count(*) FROM spring_session WHERE session_id = ?", Integer.class, sessionId);
        Integer attributeRows =
                jdbc.queryForObject(
                        "SELECT count(*) FROM spring_session_attributes a JOIN spring_session s"
                                + " ON a.session_primary_id = s.primary_id WHERE s.session_id = ?",
                        Integer.class,
                        sessionId);
        assertThat(sessionRows).isEqualTo(1);
        assertThat(attributeRows).isEqualTo(1);

        sessions.deleteById(sessionId);
    }

    // A generic helper, so the session type the repository uses stays consistent.
    private static <S extends Session> String saveAndReload(SessionRepository<S> repository) {
        S session = repository.createSession();
        session.setAttribute("check", "flyway-v1");
        repository.save(session);

        S reloaded = repository.findById(session.getId());

        assertThat(reloaded).isNotNull();
        assertThat(reloaded.<String>getAttribute("check")).isEqualTo("flyway-v1");
        return session.getId();
    }
}
