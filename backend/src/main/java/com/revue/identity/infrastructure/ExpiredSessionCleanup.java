package com.revue.identity.infrastructure;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.transaction.TransactionException;

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

    private static final Logger LOG = LoggerFactory.getLogger(ExpiredSessionCleanup.class);

    private final JdbcIndexedSessionRepository sessions;

    ExpiredSessionCleanup(JdbcIndexedSessionRepository sessions) {
        this.sessions = sessions;
    }

    @EventListener(ApplicationReadyEvent.class)
    void deleteAtStartup() {
        deleteExpiredSessions("startup");
    }

    @Scheduled(cron = DAILY_CRON, zone = ZONE)
    void deleteDaily() {
        deleteExpiredSessions("scheduled");
    }

    private void deleteExpiredSessions(String trigger) {
        String operationId = UUID.randomUUID().toString();
        try {
            sessions.cleanUpExpiredSessions();
        } catch (DataAccessException | TransactionException ex) {
            LOG.atWarn()
                .addKeyValue("event.name", "session.cleanup")
                .addKeyValue("event.outcome", "failure")
                .addKeyValue("event.reason", ex.getClass().getSimpleName())
                .addKeyValue("error.cause_type", ex.getMostSpecificCause().getClass().getSimpleName())
                .addKeyValue("operation.id", operationId)
                .addKeyValue("job.trigger", trigger)
                .log("Expired-session cleanup failed; the next scheduled run will retry");
            return;
        }
        LOG.atInfo()
            .addKeyValue("event.name", "session.cleanup")
            .addKeyValue("event.outcome", "success")
            .addKeyValue("operation.id", operationId)
            .addKeyValue("job.trigger", trigger)
            .log("Expired-session cleanup finished");
    }
}
