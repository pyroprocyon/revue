package com.revue.content.infrastructure.files;

import static org.assertj.core.api.Assertions.assertThat;

import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.ContentRules;
import com.revue.content.domain.SetDefinition;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Publishing rules for shared sets: a question, answer and source are required. Explanations and up to two distinct key
 * ideas are optional but follow the rules when written. Keys are unique across files, and a set cannot repeat a
 * question. Each case breaks one rule of a valid file.
 */
class ContentRulesTests {

    private static final String VALID = """
        set_key: test-set
        title: Test Set
        description: A set for tests.
        publisher: Revue
        subject: Science
        cards:
          - key: card-one
            question: What is one?
            answer: One.
            source: A plain source.
          - key: card-two
            question: What is two?
            answer: Two.
            key_ideas:
              - The number two
              - Comes after one
            explanation: Because two comes second.
            memory_hook: Two shoes.
            source: A source.
        """;

    @Test
    void theValidFileParsesWithNoProblems() {
        List<String> problems = new ArrayList<>();

        SetDefinition set = ContentParser.parse("test.yaml", VALID, problems);
        ContentRules.check(List.of(set), problems);

        assertThat(problems).isEmpty();
        assertThat(set.setKey()).isEqualTo("test-set");
        assertThat(set.cards()).extracting(CardDefinition::key).containsExactly("card-one", "card-two");
        CardDefinition plain = set.cards().get(0);
        assertThat(plain.explanation()).isNull();
        assertThat(plain.source()).isEqualTo("A plain source.");
        assertThat(plain.memoryHook()).isNull();
        assertThat(plain.keyIdeas()).isEmpty();
        assertThat(set.cards().get(1).keyIdeas()).containsExactly("The number two", "Comes after one");
    }

    @Test
    void longKeysAreCheckedWithoutRecursiveBacktracking() {
        String key = "a-".repeat(10_000) + "z";
        assertThat(problemsFor(VALID.replace("test-set", key))).isEmpty();
        assertThat(problemsFor(VALID.replace("test-set", key + "-"))).anySatisfy(
            problem -> assertThat(problem).contains("must be lowercase letters and digits joined by hyphens"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("brokenFiles")
    void theFileThatBreaksOneRuleIsReported(String rule, String yaml, String expectedProblem) {
        assertThat(problemsFor(yaml)).anySatisfy(problem -> assertThat(problem).contains(expectedProblem));
    }

    static Stream<Arguments> brokenFiles() {
        return Stream.of(
            broken("missing answer", "    answer: One.\n", "", "card card-one: answer is missing"),
            broken("missing source", "    source: A plain source.\n", "", "source is missing"),
            broken("null source", "    source: A plain source.", "    source: null", "source is missing"),
            broken("source given as a number", "    source: A plain source.", "    source: 12", "source must be text"),
            broken(
                "source too long",
                "    source: A plain source.",
                "    source: " + "x".repeat(501),
                "source is longer than 500 characters"),
            broken("missing subject", "subject: Science\n", "", "subject is missing"),
            broken("blank question", "question: What is one?", "question: ' '", "question must not be blank"),
            broken(
                "blank explanation",
                "    explanation: Because two comes second.",
                "    explanation: ' '",
                "explanation must not be blank"),
            broken("blank source", "    source: A source.", "    source: ' '", "source must not be blank"),
            broken(
                "three key ideas",
                "      - Comes after one\n",
                "      - Comes after one\n      - Is even\n",
                "key_ideas may list at most two ideas"),
            broken(
                "repeated key idea",
                "      - Comes after one",
                "      - The number two",
                "key_ideas must be different from each other"),
            broken("blank key idea", "      - The number two", "      - ' '", "key idea must not be blank"),
            broken("same question twice", "What is two?", "What is one?", "asks the same question"),
            broken(
                "misspelled field",
                "    explanation: Because two",
                "    explaination: Because two",
                "unknown field explaination"),
            broken("unquoted yes as an answer", "    answer: One.", "    answer: yes", "answer must be text"),
            broken("key with spaces", "key: card-one", "key: Card One", "lowercase letters and digits"),
            broken("field given twice", "    answer: One.", "    answer: One.\n    answer: Uno.", "not valid YAML"));
    }

    @Test
    void theCardKeyUsedInTwoFilesIsReported() {
        String other = VALID.replace("set_key: test-set", "set_key: other-set")
            .replace("key: card-two", "key: card-three");

        assertThat(problemsFor(VALID, other))
            .anySatisfy(problem -> assertThat(problem).contains("card card-one: key is also used in file-0.yaml"));
    }

    @Test
    void theSetKeyUsedInTwoFilesIsReported() {
        String other = VALID.replace("key: card-one", "key: card-five").replace("key: card-two", "key: card-six");

        assertThat(problemsFor(VALID, other))
            .anySatisfy(problem -> assertThat(problem).contains("set_key test-set is also used in file-0.yaml"));
    }

    private static Arguments broken(String rule, String find, String replaceWith, String expectedProblem) {
        assertThat(VALID).as(rule).contains(find);
        return Arguments
            .of(rule, VALID.replaceFirst(Pattern.quote(find), Matcher.quoteReplacement(replaceWith)), expectedProblem);
    }

    private static List<String> problemsFor(String... yamls) {
        List<String> problems = new ArrayList<>();
        List<SetDefinition> sets = new ArrayList<>();
        for (int i = 0; i < yamls.length; i++) {
            SetDefinition set = ContentParser.parse("file-" + i + ".yaml", yamls[i], problems);
            if (set != null) {
                sets.add(set);
            }
        }
        ContentRules.check(sets, problems);
        return problems;
    }
}
