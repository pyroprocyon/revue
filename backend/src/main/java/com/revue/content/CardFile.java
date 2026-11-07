package com.revue.content;

import java.util.List;

import org.jspecify.annotations.Nullable;

/**
 * One card as written in a set's YAML file, after parsing. {@link ContentRules} decides whether
 * it may be published.
 */
record CardFile(String key, String question, String answer, List<String> keyIdeas, String explanation,
		@Nullable String memoryHook, String source) {

	CardFile {
		keyIdeas = List.copyOf(keyIdeas);
	}

}
