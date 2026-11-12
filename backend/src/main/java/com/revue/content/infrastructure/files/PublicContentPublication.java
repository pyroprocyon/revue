package com.revue.content.infrastructure.files;

import com.revue.content.application.CatalogPublisher;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** Explicit one-off publication job. Serving replicas never republish on startup. */
@Component
@ConditionalOnProperty(name = "revue.content.publish", havingValue = "true")
class PublicContentPublication implements ApplicationRunner {
    private static final Logger LOG = LoggerFactory.getLogger(PublicContentPublication.class);

    private static final String EVENT_NAME = "event.name";
    private static final String EVENT_OUTCOME = "event.outcome";

    private final CatalogPublisher publisher;

    PublicContentPublication(CatalogPublisher publisher) {
        this.publisher = publisher;
    }

    @Override
    public void run(ApplicationArguments arguments) throws IOException {
        try (var _ = MDC.putCloseable("operation.id", UUID.randomUUID().toString())) {
            LOG.atInfo()
                .addKeyValue(EVENT_NAME, "catalog.publication_started")
                .addKeyValue(EVENT_OUTCOME, "started")
                .log("Catalog publication started");
            try {
                publish();
            } catch (IOException | RuntimeException ex) {
                LOG.atError()
                    .addKeyValue(EVENT_NAME, "catalog.publication_failed")
                    .addKeyValue(EVENT_OUTCOME, "failure")
                    .addKeyValue("event.reason", ex.getClass().getSimpleName())
                    .log("Catalog publication did not finish successfully");
                throw ex;
            }
        }
    }

    private void publish() throws IOException {
        long revision = Long.parseLong(
            new ClassPathResource("publication-revision.txt").getContentAsString(StandardCharsets.UTF_8).strip());
        var source = PublicContent.readAndCheck();
        if (!publisher.publish(revision, PublicationSource.digest(source), source)) {
            LOG.atInfo()
                .addKeyValue(EVENT_NAME, "catalog.publication_skipped")
                .addKeyValue(EVENT_OUTCOME, "no_change")
                .addKeyValue("event.reason", "already_published")
                .addKeyValue("catalog.revision", revision)
                .log("Catalog revision already published");
        }
    }
}
