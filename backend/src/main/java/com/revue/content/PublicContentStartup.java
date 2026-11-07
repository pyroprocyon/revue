package com.revue.content;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Loads the public set files once the app has started (plan section 5).
 *
 * <p>If the files are missing or break a rule, the app keeps running with the content already in
 * the database, and the error is logged. CI runs the same checks on the real files, so a broken
 * file normally can't reach a deploy. Database errors are not caught: the app can't serve students
 * without its database anyway.
 *
 * <p>{@code revue.content.load-on-startup=false} turns this off. The Docker build's AOT training
 * run uses it, because no database is reachable there.
 */
@Component
@ConditionalOnProperty(name = "revue.content.load-on-startup", havingValue = "true", matchIfMissing = true)
class PublicContentStartup {

	private static final Logger log = LoggerFactory.getLogger(PublicContentStartup.class);

	private final ContentLoader loader;

	PublicContentStartup(ContentLoader loader) {
		this.loader = loader;
	}

	@EventListener(ApplicationReadyEvent.class)
	void loadPublicContent() {
		try {
			ContentLoader.Result result = loader.load(PublicContent.readAndCheck());
			if (result.changedNothing()) {
				log.info("Public content is up to date");
			}
			else {
				log.info("Public content loaded: {}", result);
			}
		}
		catch (InvalidContentException ex) {
			log.error("Public content not loaded; keeping the current content. Problems: {}",
					String.join("; ", ex.problems()));
		}
		catch (ContentUnavailableException ex) {
			log.error("Public content not loaded; keeping the current content", ex);
		}
	}

}
