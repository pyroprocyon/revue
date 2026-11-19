package com.revue.reviews.domain;

/** The name a learner gives a personal deck. */
public record DeckTitle(String value) {
    public static final int MAX_LENGTH = 50;

    /** Rejects a blank title and one longer than the limit. */
    public DeckTitle {
        value = LearnerText.required(value, MAX_LENGTH);
    }
}
