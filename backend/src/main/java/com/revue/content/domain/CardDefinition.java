package com.revue.content.domain;

import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * A format-independent card definition for publication. {@link ContentRules} decides whether it may be published. The
 * key, question, answer and source are required.
 */
public record CardDefinition(
    String key,
    String question,
    String answer,
    List<String> keyIdeas,
    @Nullable String explanation,
    @Nullable String memoryHook,
    @Nullable String source) {

    /** Copies the key ideas to keep the card definition immutable. */
    public CardDefinition {
        keyIdeas = List.copyOf(keyIdeas);
    }
}
