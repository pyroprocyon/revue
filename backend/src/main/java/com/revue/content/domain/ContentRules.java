package com.revue.content.domain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * The publishing rules for shared sets (plan section 5), checked across every set file together. The loader runs them
 * before it changes anything, and {@code PublicContentTests} runs them on the real files in CI, so a broken file fails
 * the build before it can be deployed.
 *
 * <p>Approvals, content hashes and {@code answer_revision} are deferred with the MVP (plan section 14, "MVP first"), so
 * these rules don't cover them yet.
 */
public final class ContentRules {

    /** Lowercase words joined by hyphens, so keys stay stable and safe to use in links. */
    private static final Pattern KEY = Pattern.compile("[a-z0-9]++(?:-[a-z0-9]++)*+");

    private static final int MAX_TITLE = 100;

    private static final int MAX_DESCRIPTION = 300;

    private static final int MAX_QUESTION = 500;

    private static final int MAX_ANSWER = 1000;

    private static final int MAX_KEY_IDEAS = 2;

    private static final int MAX_KEY_IDEA = 200;

    private static final int MAX_EXPLANATION = 2000;

    private static final int MAX_MEMORY_HOOK = 300;

    private static final int MAX_SOURCE = 500;

    private ContentRules() {
    }

    /** Adds every rule each set breaks to {@code problems}. */
    public static void check(List<SetDefinition> sets, List<String> problems) {
        Map<String, String> fileBySetKey = new HashMap<>();
        Map<String, String> fileByCardKey = new HashMap<>();
        for (SetDefinition set : sets) {
            String file = set.sourceName();
            checkKey(set.setKey(), file + ": set_key", problems);
            String otherFile = fileBySetKey.putIfAbsent(set.setKey(), file);
            if (otherFile != null) {
                problems.add(file + ": set_key " + set.setKey() + " is also used in " + otherFile);
            }
            checkText(set.title(), MAX_TITLE, file + ": title", problems);
            checkText(set.description(), MAX_DESCRIPTION, file + ": description", problems);
            checkText(set.publisher(), MAX_TITLE, file + ": publisher", problems);
            checkText(set.subject(), MAX_TITLE, file + ": subject", problems);

            Set<String> questions = new HashSet<>();
            for (CardDefinition card : set.cards()) {
                String label = file + ", card " + card.key();
                checkKey(card.key(), label + ": key", problems);
                String fileWithKey = fileByCardKey.putIfAbsent(card.key(), file);
                if (fileWithKey != null) {
                    problems.add(label + ": key is also used in " + fileWithKey);
                }
                checkText(card.question(), MAX_QUESTION, label + ": question", problems);
                if (!questions.add(card.question().strip())) {
                    problems.add(label + ": another card in this set asks the same question");
                }
                checkText(card.answer(), MAX_ANSWER, label + ": answer", problems);
                checkKeyIdeas(card.keyIdeas(), label, problems);
                checkOptionalText(card.explanation(), MAX_EXPLANATION, label + ": explanation", problems);
                checkOptionalText(card.memoryHook(), MAX_MEMORY_HOOK, label + ": memory_hook", problems);
                checkText(card.source(), MAX_SOURCE, label + ": source", problems);
            }
        }
    }

    private static void checkKeyIdeas(List<String> keyIdeas, String label, List<String> problems) {
        if (keyIdeas.size() > MAX_KEY_IDEAS) {
            problems.add(label + ": key_ideas may list at most two ideas");
            return;
        }
        Set<String> distinct = new HashSet<>();
        for (String idea : keyIdeas) {
            checkText(idea, MAX_KEY_IDEA, label + ": key idea", problems);
            if (!distinct.add(idea.strip())) {
                problems.add(label + ": key_ideas must be different from each other");
            }
        }
    }

    private static void checkKey(String key, String label, List<String> problems) {
        if (!KEY.matcher(key).matches()) {
            problems.add(
                label + " must be lowercase letters and digits joined by hyphens, such as " + "why-sweating-cools");
        }
    }

    /** An optional field may be left out, but when it is written it follows the same rules. */
    private static void checkOptionalText(@Nullable String text, int maxLength, String label, List<String> problems) {
        if (text != null) {
            checkText(text, maxLength, label, problems);
        }
    }

    private static void checkText(@Nullable String text, int maxLength, String label, List<String> problems) {
        if (text == null) {
            problems.add(label + " is missing");
        } else if (text.isBlank()) {
            problems.add(label + " must not be blank");
        } else if (text.length() > maxLength) {
            problems.add(label + " is longer than " + maxLength + " characters");
        }
    }

    /** Rejects moving an existing card key into another published set. */
    public static void checkOwnership(List<SetDefinition> files, List<PublishedSet> existing) {
        Map<String, String> ownerByCard = new HashMap<>();
        for (PublishedSet set : existing) {
            for (PublishedCard card : set.cards()) {
                ownerByCard.put(card.key(), set.key());
            }
        }
        List<String> problems = new ArrayList<>();
        for (SetDefinition file : files) {
            for (CardDefinition card : file.cards()) {
                String owner = ownerByCard.get(card.key());
                if (owner != null && !owner.equals(file.setKey())) {
                    problems.add(
                        file.sourceName() + ", card " + card.key() + ": key belongs to set " + owner
                            + "; a card can't move between sets");
                }
            }
        }
        if (!problems.isEmpty()) {
            throw new InvalidContentException(problems);
        }
    }
}
