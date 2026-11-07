package com.revue.content;

import java.util.List;

/**
 * One shared set as written in its YAML file, after parsing. {@code fileName} only labels
 * problems for the person fixing the file; the loader identifies the set by {@code setKey}.
 */
record SetFile(String fileName, String setKey, String title, String description, String publisher,
		String subject, List<CardFile> cards) {

	SetFile {
		cards = List.copyOf(cards);
	}

}
