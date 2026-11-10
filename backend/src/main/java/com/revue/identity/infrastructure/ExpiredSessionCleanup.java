package com.revue.identity.infrastructure;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;

/**
 * Deletes expired session rows once at startup and then daily at noon, Manila time.
 *
 * <p>Spring Session's own cleanup queries PostgreSQL every minute, so the free Neon database would never pause. {@code
 * spring.session.jdbc.cleanup-cron=-} turns it off. Noon falls inside the hours when the uptime monitor keeps the app
 * awake. An expired session already stops working when it expires, because Spring Session checks the expiry on each
 * read. This job only removes the rows.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
class ExpiredSessionCleanup {

    private static final String DAILY_CRON = "0 0 12 * * *";

    private static final String ZONE = "Asia/Manila";

    private static final Logger log = LoggerFactory.getLogger(ExpiredSessionCleanup.class);

    private final JdbcIndexedSessionRepository sessions;

    ExpiredSessionCleanup(JdbcIndexedSessionRepository sessions) {
        this.sessions = sessions;
    }

    @EventListener(ApplicationReadyEvent.class)
    void deleteAtStartup() {
        // An exception here would stop the app from starting, and this cleanup can wait a day.
        try {
            sessions.cleanUpExpiredSessions();
        } catch (DataAccessException ex) {
            log.warn("Expired-session cleanup failed at startup; the daily run will retry", ex);
        }
    }

    @Scheduled(cron = DAILY_CRON, zone = ZONE)
    void deleteDaily() {
        sessions.cleanUpExpiredSessions();
    }
}
