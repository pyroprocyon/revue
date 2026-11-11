package com.revue.content.infrastructure.files;

import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.ContentRules;
import com.revue.content.domain.SetDefinition;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jspecify.annotations.Nullable;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;
import org.yaml.snakeyaml.error.YAMLException;

/**
 * Reads one set file's YAML into a {@link SetDefinition}, checking its shape: known field names only, text where text
 * is expected, and a list of cards. Publishing rules such as key-idea counts and duplicate keys live in {@link
 * ContentRules}.
 *
 * <p>The YAML is parsed with SnakeYAML's safe constructor, so a file can't create Java objects. Unquoted values such as
 * {@code yes} or {@code 12} become booleans or numbers in YAML; the parser reports them so the author quotes them,
 * instead of publishing "true" as an answer.
 */
final class ContentParser {

    private static final Set<String> SET_FIELDS = Set
        .of("set_key", "title", "description", "publisher", "subject", "cards");

    private static final Set<String> CARD_FIELDS = Set
        .of("key", "question", "answer", "key_ideas", "explanation", "memory_hook", "source");

    private ContentParser() {
    }

    /**
     * Returns the parsed set, or null when the file's shape is too broken to read. Every problem found is added to
     * {@code problems}, labeled with the file name and card key.
     */
    static @Nullable SetDefinition parse(String fileName, String yaml, List<String> problems) {
        Object root;
        try {
            root = newYaml().load(yaml);
        } catch (YAMLException ex) {
            problems.add(fileName + ": not valid YAML: " + firstLine(ex.getMessage()));
            return null;
        }
        if (!(root instanceof Map<?, ?> setMap)) {
            problems.add(fileName + ": must be a YAML mapping with set_key, title and cards");
            return null;
        }
        int problemsBefore = problems.size();
        reportUnknownFields(setMap, SET_FIELDS, fileName, problems);
        String setKey = text(setMap, "set_key", fileName, problems);
        String title = text(setMap, "title", fileName, problems);
        String description = text(setMap, "description", fileName, problems);
        String publisher = text(setMap, "publisher", fileName, problems);
        String subject = text(setMap, "subject", fileName, problems);
        List<CardDefinition> cards = cards(setMap.get("cards"), fileName, problems);
        if (problems.size() > problemsBefore) {
            return null;
        }
        return new SetDefinition(fileName, setKey, title, description, publisher, subject, cards);
    }

    private static List<CardDefinition> cards(@Nullable Object value, String fileName, List<String> problems) {
        if (!(value instanceof List<?> list) || list.isEmpty()) {
            problems.add(fileName + ": cards must be a non-empty list");
            return List.of();
        }
        List<CardDefinition> cards = new ArrayList<>();
        for (int i = 0; i < list.size(); i++) {
            if (!(list.get(i) instanceof Map<?, ?> cardMap)) {
                problems.add(fileName + ": card " + (i + 1) + " must be a mapping");
                continue;
            }
            Object rawKey = cardMap.get("key");
            String label = fileName + ", card " + (rawKey instanceof String key ? key : String.valueOf(i + 1));
            int problemsBefore = problems.size();
            reportUnknownFields(cardMap, CARD_FIELDS, label, problems);
            String key = text(cardMap, "key", label, problems);
            String question = text(cardMap, "question", label, problems);
            String answer = text(cardMap, "answer", label, problems);
            List<String> keyIdeas = optionalTextList(cardMap, "key_ideas", label, problems);
            String explanation = optionalText(cardMap, "explanation", label, problems);
            String memoryHook = optionalText(cardMap, "memory_hook", label, problems);
            String source = text(cardMap, "source", label, problems);
            if (problems.size() == problemsBefore) {
                cards.add(new CardDefinition(key, question, answer, keyIdeas, explanation, memoryHook, source));
            }
        }
        return cards;
    }

    private static String text(Map<?, ?> map, String field, String label, List<String> problems) {
        Object value = map.get(field);
        if (value == null) {
            problems.add(label + ": " + field + " is missing");
            return "";
        }
        if (!(value instanceof String text)) {
            problems.add(label + ": " + field + " must be text; put it in quotes");
            return "";
        }
        return text;
    }

    private static @Nullable String optionalText(Map<?, ?> map, String field, String label, List<String> problems) {
        return map.get(field) == null ? null : text(map, field, label, problems);
    }

    private static List<String> optionalTextList(Map<?, ?> map, String field, String label, List<String> problems) {
        Object value = map.get(field);
        if (value == null) {
            return List.of();
        }
        if (!(value instanceof List<?> list)) {
            problems.add(label + ": " + field + " must be a list");
            return List.of();
        }
        List<String> texts = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof String text)) {
                problems.add(label + ": every entry in " + field + " must be text; put it in quotes");
                return List.of();
            }
            texts.add(text);
        }
        return texts;
    }

    private static void reportUnknownFields(Map<?, ?> map, Set<String> known, String label, List<String> problems) {
        for (Object field : map.keySet()) {
            if (!known.contains(String.valueOf(field))) {
                problems.add(label + ": unknown field " + field);
            }
        }
    }

    private static Yaml newYaml() {
        LoaderOptions options = new LoaderOptions();
        options.setAllowDuplicateKeys(false);
        options.setMaxAliasesForCollections(10);
        return new Yaml(new SafeConstructor(options));
    }

    private static String firstLine(@Nullable String message) {
        if (message == null) {
            return "unreadable";
        }
        int newline = message.indexOf('\n');
        return newline < 0 ? message : message.substring(0, newline);
    }
}
