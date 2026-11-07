package com.revue.content;

import java.util.List;

/**
 * The content files break a publishing rule. The loader changes nothing when this is thrown, so
 * students keep the content that was already loaded.
 */
class InvalidContentException extends RuntimeException {

	private final List<String> problems;

	InvalidContentException(List<String> problems) {
		super("Invalid content: " + String.join("; ", problems));
		this.problems = List.copyOf(problems);
	}

	List<String> problems() {
		return problems;
	}

}
