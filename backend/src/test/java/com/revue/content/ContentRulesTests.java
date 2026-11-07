package com.revue.content;

import static org.assertj.core.api.Assertions.assertThat;

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
 * The publishing rules for set files (plan section 5): every shared card has an explanation and a
 * source and one or two distinct key ideas, keys are unique across all files, and a set doesn't
 * ask the same question twice. Each case breaks exactly one rule of an otherwise valid file.
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
			    key_ideas:
			      - The number one
			    explanation: Because one comes first.
			    source: A source.
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
	void aValidFileParsesWithNoProblems() {
		List<String> problems = new ArrayList<>();

		SetFile set = ContentParser.parse("test.yaml", VALID, problems);
		ContentRules.check(List.of(set), problems);

		assertThat(problems).isEmpty();
		assertThat(set.setKey()).isEqualTo("test-set");
		assertThat(set.cards()).extracting(CardFile::key).containsExactly("card-one", "card-two");
		assertThat(set.cards().get(0).memoryHook()).isNull();
		assertThat(set.cards().get(1).keyIdeas()).containsExactly("The number two", "Comes after one");
	}

	@ParameterizedTest(name = "{0}")
	@MethodSource("brokenFiles")
	void aFileThatBreaksARuleIsReported(String rule, String yaml, String expectedProblem) {
		assertThat(problemsFor(yaml)).anySatisfy(problem -> assertThat(problem).contains(expectedProblem));
	}

	static Stream<Arguments> brokenFiles() {
		return Stream.of(
				broken("missing explanation", "    explanation: Because one comes first.\n", "",
						"card card-one: explanation is missing"),
				broken("missing source", "    source: A source.\n  - key: card-two", "  - key: card-two",
						"card card-one: source is missing"),
				broken("missing subject", "subject: Science\n", "", "subject is missing"),
				broken("blank question", "question: What is one?", "question: ' '", "question must not be blank"),
				broken("no key ideas", "    key_ideas:\n      - The number one\n", "    key_ideas: []\n",
						"key_ideas must list one or two ideas"),
				broken("three key ideas", "      - Comes after one\n", "      - Comes after one\n      - Is even\n",
						"key_ideas must list one or two ideas"),
				broken("repeated key idea", "      - Comes after one", "      - The number two",
						"key_ideas must be different from each other"),
				broken("blank key idea", "      - The number one", "      - ' '", "key idea must not be blank"),
				broken("same question twice", "What is two?", "What is one?", "asks the same question"),
				broken("misspelled field", "    explanation: Because one", "    explaination: Because one",
						"unknown field explaination"),
				broken("unquoted yes as an answer", "    answer: One.", "    answer: yes", "answer must be text"),
				broken("key with spaces", "key: card-one", "key: Card One", "lowercase letters and digits"),
				broken("field given twice", "    answer: One.", "    answer: One.\n    answer: Uno.",
						"not valid YAML"));
	}

	@Test
	void aCardKeyUsedInTwoFilesIsReported() {
		String other = VALID.replace("set_key: test-set", "set_key: other-set")
			.replace("key: card-two", "key: card-three");

		assertThat(problemsFor(VALID, other))
			.anySatisfy(problem -> assertThat(problem).contains("card card-one: key is also used in file-0.yaml"));
	}

	@Test
	void aSetKeyUsedInTwoFilesIsReported() {
		String other = VALID.replace("key: card-one", "key: card-five").replace("key: card-two", "key: card-six");

		assertThat(problemsFor(VALID, other))
			.anySatisfy(problem -> assertThat(problem).contains("set_key test-set is also used in file-0.yaml"));
	}

	private static Arguments broken(String rule, String find, String replaceWith, String expectedProblem) {
		assertThat(VALID).as(rule).contains(find);
		return Arguments.of(rule, VALID.replaceFirst(Pattern.quote(find), Matcher.quoteReplacement(replaceWith)), expectedProblem);
	}

	private static List<String> problemsFor(String... yamls) {
		List<String> problems = new ArrayList<>();
		List<SetFile> sets = new ArrayList<>();
		for (int i = 0; i < yamls.length; i++) {
			SetFile set = ContentParser.parse("file-" + i + ".yaml", yamls[i], problems);
			if (set != null) {
				sets.add(set);
			}
		}
		ContentRules.check(sets, problems);
		return problems;
	}

}
