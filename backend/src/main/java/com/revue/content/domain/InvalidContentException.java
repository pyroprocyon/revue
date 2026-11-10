package com.revue.content.domain;

import java.util.List;

/**
 * The content files break a publishing rule. The loader changes nothing when this is thrown, so students keep the
 * content that was already loaded.
 */
public class InvalidContentException extends RuntimeException {

    private final List<String> problems;

    /** Creates an import failure with an immutable list of validation problems. */
    public InvalidContentException(List<String> problems) {
        super("Invalid content: " + String.join("; ", problems));
        this.problems = List.copyOf(problems);
    }

    /** Returns the validation problems that prevented publication. */
    public List<String> problems() {
        return problems;
    }
}
