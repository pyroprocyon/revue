package com.revue.content.domain;

import java.util.List;

/**
 * A format-independent publication definition. {@code sourceName} only labels
 * problems for the person fixing the file; the loader identifies the set by {@code setKey}.
 */
public record SetDefinition(String sourceName, String setKey, String title, String description, String publisher,
		String subject, List<CardDefinition> cards) {

	public SetDefinition {
		cards = List.copyOf(cards);
	}

}
