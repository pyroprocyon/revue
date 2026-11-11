package com.revue;

import static org.assertj.core.api.Assertions.assertThat;

import com.revue.content.application.ContentLoader;
import com.revue.content.infrastructure.files.PublicContent;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** Opt-in backup/restore drill using synthetic accounts and two disposable databases. */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class RecoveryDrillCheck {
    @Autowired
    private PostgreSQLContainer postgres;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private ContentLoader loader;

    @Test
    void restorePreservesCatalogAndQuarantineDisablesRestoredAuthentication() throws Exception {
        loader.load(PublicContent.readAndCheck());
        jdbc.update(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES"
                + " ('00000000-0000-0000-0000-000000000001', 'synthetic-user', 'synthetic-not-a-password',"
                + " clock_timestamp())");
        jdbc.update(
            "INSERT INTO spring_session (primary_id, session_id, creation_time, last_access_time,"
                + " max_inactive_interval, expiry_time) VALUES ('00000000-0000-0000-0000-000000000002',"
                + " '00000000-0000-0000-0000-000000000003', 1, 1, 3600, 9999999999999)");
        jdbc.update(
            "INSERT INTO signup_invites (id, token_hash, created_at, expires_at) VALUES"
                + " ('00000000-0000-0000-0000-000000000004', repeat('a', 64), clock_timestamp(), clock_timestamp()"
                + " + interval '1 day')");
        jdbc.update(
            "INSERT INTO auth_challenges (id, user_id, purpose, token_hash, credential_version, created_at,"
                + " expires_at) VALUES ('00000000-0000-0000-0000-000000000005',"
                + " '00000000-0000-0000-0000-000000000001', 'RESET_PASSWORD', repeat('b', 64), 0,"
                + " clock_timestamp(), clock_timestamp() + interval '1 day')");
        var backup = postgres.execInContainer(
            "pg_dump",
            "-U",
            postgres.getUsername(),
            "-d",
            postgres.getDatabaseName(),
            "-Fc",
            "--no-owner",
            "--no-acl",
            "-f",
            "/tmp/recovery.dump");
        assertThat(backup.getExitCode()).as(backup.getStderr()).isZero();
        byte[] dump = postgres.copyFileFromContainer("/tmp/recovery.dump", InputStream::readAllBytes);
        try (var restored = new PostgreSQLContainer("postgres:18.6")) {
            restored.start();
            final long start = System.nanoTime();
            restored.copyFileToContainer(Transferable.of(dump), "/tmp/recovery.dump");
            var restore = restored.execInContainer(
                "pg_restore",
                "-U",
                restored.getUsername(),
                "-d",
                restored.getDatabaseName(),
                "--no-owner",
                "--no-acl",
                "--exit-on-error",
                "/tmp/recovery.dump");
            assertThat(restore.getExitCode()).as(restore.getStderr()).isZero();
            var dataSource = new DriverManagerDataSource(
                restored.getJdbcUrl(),
                restored.getUsername(),
                restored.getPassword());
            var recovered = new JdbcTemplate(dataSource);
            assertThat(recovered.queryForList("SELECT * FROM sets ORDER BY id"))
                .isEqualTo(jdbc.queryForList("SELECT * FROM sets ORDER BY id"));
            assertThat(
                recovered.queryForObject(
                    "SELECT md5(string_agg(row_to_json(c)::text, ',' ORDER BY id)) FROM cards c",
                    String.class))
                .isEqualTo(
                    jdbc.queryForObject(
                        "SELECT md5(string_agg(row_to_json(c)::text, ',' ORDER BY id)) FROM cards c",
                        String.class));
            try (var connection = dataSource.getConnection()) {
                ScriptUtils.executeSqlScript(
                    connection,
                    new FileSystemResource("../scripts/quarantine-restored-database.sql"));
            }
            assertThat(recovered.queryForObject("SELECT count(*) FROM spring_session", Integer.class)).isZero();
            assertThat(recovered.queryForObject("SELECT count(*) FROM auth_challenges", Integer.class)).isZero();
            assertThat(
                recovered.queryForObject("SELECT count(*) FROM signup_invites WHERE revoked_at IS NULL", Integer.class))
                .isZero();
            assertThat(
                recovered.queryForObject(
                    "SELECT count(*) FROM users WHERE NOT credential_reset_required OR" + " credential_version = 0",
                    Integer.class))
                .isZero();
            Path report = Path.of("target/quality/recovery-drill.json");
            Files.createDirectories(report.getParent());
            Files.writeString(
                report,
                "{\"scope\":\"disposable local restore and authentication"
                    + " quarantine\",\"verified\":true,\"dumpBytes\":" + dump.length + ",\"restoreAndVerifyMs\":"
                    + (System.nanoTime() - start) / 1_000_000 + "}\n");
        }
    }
}
