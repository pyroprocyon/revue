package com.revue;

import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariDataSource;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;
import org.springframework.scheduling.support.SimpleTriggerContext;
import org.springframework.session.Session;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.CookieSerializer.CookieValue;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Session and connection settings from plan section 3. A misspelled property is ignored without an error, so these
 * tests read each value back from the running beans.
 *
 * <p>They run a real server. Spring Boot builds the session cookie settings from {@code
 * server.servlet.session.cookie.*} only when it starts an embedded web server. In a mock environment, Spring Session
 * copies the mock servlet container's defaults instead, which have no HttpOnly, SameSite or Max-Age, so a mock test
 * would check a cookie production never sends.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SessionAndPoolSettingsTests {

    @Autowired private JdbcIndexedSessionRepository sessions;

    @Autowired private CookieSerializer cookieSerializer;

    @Autowired private DataSource dataSource;

    @Autowired private List<ScheduledTaskHolder> scheduledTaskHolders;

    @Test
    void theSessionEndsAfterSevenIdleDays() {
        Session session = sessions.createSession();

        assertThat(session.getMaxInactiveInterval()).isEqualTo(Duration.ofDays(7));
    }

    @Test
    void theSessionCookieLastsThirtyDaysAndScriptsCannotReadIt() {
        String cookie = writeSessionCookie(cookieSerializer);

        assertThat(cookie).contains("Max-Age=2592000", "HttpOnly", "SameSite=Lax");
        // Local development runs over plain HTTP, where a Secure cookie would never come back.
        assertThat(cookie).doesNotContain("Secure");
    }

    @Test
    void expiredSessionsAreDeletedDailyAtNoonManilaTime() {
        // Spring Session's own cleanup would run every minute. With it off, the session repository
        // starts no scheduler of its own. Spring Session offers no public way to check this, so if
        // an upgrade renames the field, recheck that `spring.session.jdbc.cleanup-cron=-` still works.
        assertThat(ReflectionTestUtils.getField(sessions, "taskScheduler")).isNull();

        List<CronTask> cronTasks =
                scheduledTaskHolders.stream()
                        .flatMap(holder -> holder.getScheduledTasks().stream())
                        .map(ScheduledTask::getTask)
                        .filter(CronTask.class::isInstance)
                        .map(CronTask.class::cast)
                        .toList();
        assertThat(cronTasks).singleElement().extracting(CronTask::getExpression).isEqualTo("0 0 12 * * *");

        // 11:00 in Manila (UTC+8, no daylight saving) is 03:00 UTC; noon there is 04:00 UTC.
        Clock elevenInManila = Clock.fixed(Instant.parse("2026-11-06T03:00:00Z"), ZoneOffset.UTC);
        Instant nextRun = cronTasks.getFirst().getTrigger().nextExecution(new SimpleTriggerContext(elevenInManila));
        assertThat(nextRun).isEqualTo(Instant.parse("2026-11-06T04:00:00Z"));
    }

    @Test
    void theConnectionPoolStaysSmallAndClosesIdleConnections() throws Exception {
        HikariDataSource pool = dataSource.unwrap(HikariDataSource.class);

        assertThat(pool.getMaximumPoolSize()).isEqualTo(5);
        assertThat(pool.getMinimumIdle()).isZero();
        assertThat(pool.getIdleTimeout()).isEqualTo(Duration.ofMinutes(1).toMillis());
    }

    /** Returns the Set-Cookie header the session cookie serializer writes for a plain HTTP request. */
    static String writeSessionCookie(CookieSerializer serializer) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        serializer.writeCookieValue(new CookieValue(request, response, "test-session-id"));
        return response.getHeader(HttpHeaders.SET_COOKIE);
    }
}
