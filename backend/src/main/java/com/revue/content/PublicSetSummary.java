package com.revue.content;

/**
 * What a visitor sees about a public set before trying it: no answers and nothing about any
 * student. {@code cardCount} counts the set's active cards.
 */
record PublicSetSummary(String setKey, String title, String description, String publisherName, long cardCount,
		boolean trialAvailable) {

}
