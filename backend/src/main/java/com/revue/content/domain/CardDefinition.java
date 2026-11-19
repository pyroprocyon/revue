package com.revue.content.domain;

import org.jspecify.annotations.Nullable;

/**
 * A format-independent card definition for publication. {@link ContentRules} decides whether it may be published. The
 * key, question, answer and source are required.
 */
public record CardDefinition(
    String key,
    String question,
    String answer,
    @Nullable String explanation,
    @Nullable String memoryHook,
    @Nullable String source) {
}
