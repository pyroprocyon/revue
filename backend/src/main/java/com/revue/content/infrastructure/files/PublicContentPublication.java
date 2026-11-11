package com.revue.content.infrastructure.files;

import com.revue.content.application.CatalogPublisher;
import java.nio.charset.StandardCharsets;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** Explicit one-off publication job. Serving replicas never republish on startup. */
@Component
@ConditionalOnProperty(name = "revue.content.publish", havingValue = "true")
class PublicContentPublication implements ApplicationRunner {
    private final CatalogPublisher publisher;

    PublicContentPublication(CatalogPublisher publisher) {
        this.publisher = publisher;
    }

    @Override
    public void run(ApplicationArguments arguments) throws Exception {
        long revision = Long.parseLong(
            new ClassPathResource("publication-revision.txt").getContentAsString(StandardCharsets.UTF_8).strip());
        var source = PublicContent.readAndCheck();
        boolean changed = publisher.publish(revision, PublicationSource.digest(source), source);
        LoggerFactory.getLogger(getClass())
            .info("Catalog revision {}: {}", revision, changed ? "published" : "already published");
    }
}
