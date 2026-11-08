package com.revue.content.application;

import java.util.List;
import java.util.Optional;

/** Read port: projections avoid loading entire publication aggregates for public browsing. */
public interface PublicSetQueries {
	record Overview(String setKey, String title, String description, String publisherName, long cardCount) {
	}
	List<Overview> list();
	Optional<Overview> summary(String setKey);
	Optional<DemoCards> demoCards(String setKey, int limit);
}
