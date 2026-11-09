package com.revue.content.application;

import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.InvalidContentException;
import com.revue.content.domain.SetDefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.sql.Timestamp;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.UnaryOperator;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;

import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import com.revue.TestcontainersConfiguration;

/**
 * The content loader against PostgreSQL 18.6 (plan section 5): keys identify sets and cards, text
 * changes raise the content version, positions follow the file, missing content is retired and
 * never deleted, a returning key reuses its row, and a broken source changes nothing.
 *
 * <p>Startup loading is off, so this class gets its own Spring context and its own database. Each
 * test uses its own keys. Every load is a complete source, so a test's load retires sets from
 * earlier tests; the assertions only look at the test's own rows.
 */
@SpringBootTest(properties = "revue.content.load-on-startup=false")
@Import(TestcontainersConfiguration.class)
class ContentLoaderTests {

	@Autowired
	private ContentLoader loader;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private EntityManagerFactory entityManagerFactory;

	@Test
	void theFirstLoadAddsTheSetAndItsCardsInFileOrder() {
		ContentLoader.Result result = loader.load(List.of(set("first-load", "First Load",
				card("first-load-a", "Question A?"), card("first-load-b", "Question B?"),
				card("first-load-c", "Question C?"))));

		assertThat(result.setsAdded()).isEqualTo(1);
		assertThat(result.cardsAdded()).isEqualTo(3);
		Map<String, Object> set = setRow("first-load");
		assertThat(set.get("title")).isEqualTo("First Load");
		assertThat(set.get("publisher_name")).isEqualTo("Revue");
		assertThat(set.get("retired_at")).isNull();
		assertThat(cardKeysInOrder("first-load")).containsExactly("first-load-a", "first-load-b", "first-load-c");
		Map<String, Object> cardA = cardRow("first-load-a");
		assertThat(cardA.get("content_version")).isEqualTo(1);
		assertThat(keyIdeas("first-load-a")).containsExactly("First idea", "Second idea");
	}

	@Test
	void loadingTheSameFilesTwiceChangesNothing() {
		List<SetDefinition> files = List.of(set("same-twice", "Same Twice", card("same-twice-a", "Question A?"),
				card("same-twice-b", "Question B?")));
		loader.load(files);
		Timestamp setUpdated = (Timestamp) setRow("same-twice").get("updated_at");
		Timestamp cardUpdated = (Timestamp) cardRow("same-twice-a").get("updated_at");

		ContentLoader.Result second = loader.load(files);

		assertThat(second.changedNothing()).isTrue();
		assertThat(setRow("same-twice").get("updated_at")).isEqualTo(setUpdated);
		assertThat(cardRow("same-twice-a").get("updated_at")).isEqualTo(cardUpdated);
		assertThat(cardRow("same-twice-a").get("content_version")).isEqualTo(1);
	}

	@ParameterizedTest
	@ValueSource(ints = {1, 20})
	void republishingReadsTheCatalogOnlyOnce(int cardsPerSet) {
		List<SetDefinition> source = IntStream.range(0, 2).mapToObj(setIndex -> {
			String key = "catalog-reads-" + cardsPerSet + "-" + setIndex;
			CardDefinition[] cards = IntStream.range(0, cardsPerSet)
				.mapToObj(cardIndex -> card(key + "-" + cardIndex, "Question " + cardIndex + "?"))
				.toArray(CardDefinition[]::new);
			return set(key, "Catalog reads", cards);
		}).toList();
		loader.load(source);
		var statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
		boolean statisticsWereEnabled = statistics.isStatisticsEnabled();
		statistics.setStatisticsEnabled(true);
		statistics.clear();
		try {
			ContentLoader.Result result = loader.load(source);
			assertThat(result.changedNothing()).isTrue();
			assertThat(statistics.getPrepareStatementCount()).as("one set read and one card read").isEqualTo(2);
		}
		finally {
			statistics.setStatisticsEnabled(statisticsWereEnabled);
		}
	}

	@Test
	void aWordingFixRaisesOnlyThatCardsContentVersion() {
		CardDefinition a = card("wording-a", "Question A?");
		CardDefinition b = card("wording-b", "Question B?");
		loader.load(List.of(set("wording", "Wording", a, b)));
		long idBefore = cardId("wording-b");
		CardDefinition fixedB = new CardDefinition(b.key(), b.question(), b.answer(), b.keyIdeas(), "A clearer explanation.",
				b.memoryHook(), b.source());

		ContentLoader.Result result = loader.load(List.of(set("wording", "Wording", a, fixedB)));

		assertThat(result.cardsChanged()).isEqualTo(1);
		assertThat(cardId("wording-b")).isEqualTo(idBefore);
		assertThat(cardRow("wording-b").get("explanation")).isEqualTo("A clearer explanation.");
		assertThat(cardRow("wording-b").get("content_version")).isEqualTo(2);
		assertThat(cardRow("wording-a").get("content_version")).isEqualTo(1);
	}

	/**
	 * Every versioned field on its own: a correction that changes only that field is saved on the
	 * same row and raises the content version exactly once. Otherwise a fix to one field, such as
	 * the answer, could be skipped silently while students keep the old text.
	 */
	@ParameterizedTest(name = "{0}")
	@MethodSource("oneFieldCorrections")
	void aCorrectionToAnyOneFieldIsSavedAndRaisesTheVersionOnce(String field, @Nullable String startingHook,
			UnaryOperator<CardDefinition> correct, String column, Object expected) {
		String key = "fix-" + field.replace(' ', '-');
		CardDefinition original = withHook(card(key, "Question for " + key + "?"), startingHook);
		loader.load(List.of(set(key + "-set", "Fix", original)));
		long idBefore = cardId(key);

		ContentLoader.Result result = loader.load(List.of(set(key + "-set", "Fix", correct.apply(original))));

		assertThat(result.cardsChanged()).isEqualTo(1);
		assertThat(cardId(key)).isEqualTo(idBefore);
		assertThat(cardRow(key).get("content_version")).isEqualTo(2);
		Object saved = column.equals("key_ideas") ? keyIdeas(key) : cardRow(key).get(column);
		assertThat(saved).isEqualTo(expected);
	}

	static Stream<Arguments> oneFieldCorrections() {
		return Stream.of(
				correction("question", null, c -> edit(c, "A clearer question?", c.answer(), c.keyIdeas(),
						c.explanation(), c.memoryHook(), c.source()), "question", "A clearer question?"),
				correction("answer", null, c -> edit(c, c.question(), "A corrected answer.", c.keyIdeas(),
						c.explanation(), c.memoryHook(), c.source()), "answer", "A corrected answer."),
				correction("explanation", null, c -> edit(c, c.question(), c.answer(), c.keyIdeas(),
						"A clearer explanation.", c.memoryHook(), c.source()), "explanation", "A clearer explanation."),
				correction("source", null, c -> edit(c, c.question(), c.answer(), c.keyIdeas(), c.explanation(),
						c.memoryHook(), "A better source."), "source", "A better source."),
				correction("memory hook added", null, c -> edit(c, c.question(), c.answer(), c.keyIdeas(),
						c.explanation(), "A new hook.", c.source()), "memory_hook", "A new hook."),
				correction("memory hook changed", "An old hook.", c -> edit(c, c.question(), c.answer(),
						c.keyIdeas(), c.explanation(), "A better hook.", c.source()), "memory_hook", "A better hook."),
				correction("key idea reworded", null, c -> edit(c, c.question(), c.answer(),
						List.of("First idea", "A clearer second idea"), c.explanation(), c.memoryHook(), c.source()),
						"key_ideas", List.of("First idea", "A clearer second idea")),
				// Key ideas keep their file order, so reordering them is a change.
				correction("key ideas reordered", null, c -> edit(c, c.question(), c.answer(),
						List.of("Second idea", "First idea"), c.explanation(), c.memoryHook(), c.source()),
						"key_ideas", List.of("Second idea", "First idea")));
	}

	@Test
	void aSourcedCardWithoutAnExplanationIsSavedAndAddingOrRemovingANoteRaisesItsVersion() {
		CardDefinition plain = new CardDefinition("plain-card", "A plain question?", "A plain answer.", List.of(), null, null,
				"Class notes, page 1.");
		loader.load(List.of(set("plain-card-set", "Plain", plain)));

		Map<String, Object> saved = cardRow("plain-card");
		assertThat(saved.get("explanation")).isNull();
		assertThat(saved.get("source")).isEqualTo("Class notes, page 1.");
		assertThat(keyIdeas("plain-card")).isEmpty();

		CardDefinition withNote = edit(plain, plain.question(), plain.answer(), List.of(), "A short note.", null, plain.source());
		loader.load(List.of(set("plain-card-set", "Plain", withNote)));
		assertThat(cardRow("plain-card").get("explanation")).isEqualTo("A short note.");
		assertThat(cardRow("plain-card").get("content_version")).isEqualTo(2);

		loader.load(List.of(set("plain-card-set", "Plain", plain)));
		assertThat(cardRow("plain-card").get("explanation")).isNull();
		assertThat(cardRow("plain-card").get("content_version")).isEqualTo(3);
	}

	@Test
	void removingAMemoryHookIsSavedAndRaisesTheVersionOnce() {
		CardDefinition original = withHook(card("fix-hook-removed", "Question for the hook?"), "A hook to remove.");
		loader.load(List.of(set("fix-hook-removed-set", "Fix", original)));

		loader.load(List.of(set("fix-hook-removed-set", "Fix", withHook(original, null))));

		assertThat(cardRow("fix-hook-removed").get("memory_hook")).isNull();
		assertThat(cardRow("fix-hook-removed").get("content_version")).isEqualTo(2);
	}

	@Test
	void reorderingAndRemovingCardsRewritesPositionsAndRetiresTheRemovedCard() {
		CardDefinition a = card("order-a", "Question A?");
		CardDefinition b = card("order-b", "Question B?");
		CardDefinition c = card("order-c", "Question C?");
		loader.load(List.of(set("order", "Order", a, b, c)));

		// Remove the first card and swap the other two, then load the same file twice.
		loader.load(List.of(set("order", "Order", c, b)));
		ContentLoader.Result again = loader.load(List.of(set("order", "Order", c, b)));

		assertThat(again.changedNothing()).isTrue();
		assertThat(activeCardKeysInOrder("order")).containsExactly("order-c", "order-b");
		assertThat(cardRow("order-a").get("retired_at")).isNotNull();
		assertThat(cardRow("order-b").get("content_version")).isEqualTo(1);
	}

	@Test
	void aReturningCardKeyComesBackOnTheSameRow() {
		CardDefinition a = card("return-a", "Question A?");
		CardDefinition b = card("return-b", "Question B?");
		loader.load(List.of(set("return", "Return", a, b)));
		long idBefore = cardId("return-b");
		loader.load(List.of(set("return", "Return", a)));

		ContentLoader.Result result = loader.load(List.of(set("return", "Return", a, b)));

		assertThat(result.cardsRestored()).isEqualTo(1);
		assertThat(cardId("return-b")).isEqualTo(idBefore);
		assertThat(cardRow("return-b").get("retired_at")).isNull();
		assertThat(activeCardKeysInOrder("return")).containsExactly("return-a", "return-b");
	}

	@Test
	void aSetMissingFromTheSourceIsRetiredButKeepsItsCards() {
		SetDefinition kept = set("kept-set", "Kept", card("kept-a", "Question A?"));
		SetDefinition dropped = set("dropped-set", "Dropped", card("dropped-a", "Question A?"),
				card("dropped-b", "Question B?"));
		loader.load(List.of(kept, dropped));
		long setId = setId("dropped-set");

		loader.load(List.of(kept));

		assertThat(setRow("dropped-set").get("retired_at")).isNotNull();
		// Savers keep studying a retired set's active cards, so the cards themselves stay active.
		assertThat(activeCardKeysInOrder("dropped-set")).containsExactly("dropped-a", "dropped-b");

		ContentLoader.Result restored = loader.load(List.of(kept, dropped));

		assertThat(restored.setsRestored()).isEqualTo(1);
		assertThat(setId("dropped-set")).isEqualTo(setId);
		assertThat(setRow("dropped-set").get("retired_at")).isNull();
	}

	@Test
	void renamingASetKeepsTheSameRow() {
		loader.load(List.of(set("renamed", "Old Title", card("renamed-a", "Question A?"))));
		long idBefore = setId("renamed");

		loader.load(List.of(set("renamed", "New Title", card("renamed-a", "Question A?"))));

		assertThat(setId("renamed")).isEqualTo(idBefore);
		assertThat(setRow("renamed").get("title")).isEqualTo("New Title");
	}

	@Test
	void aCardCantMoveToAnotherSetAndTheFailedLoadChangesNothing() {
		CardDefinition moving = card("move-a", "Question A?");
		loader.load(List.of(set("move-from", "From", moving, card("move-b", "Question B?"))));

		SetDefinition from = set("move-from", "From", card("move-b", "Question B?"));
		SetDefinition to = set("move-to", "To", moving);
		assertThatExceptionOfType(InvalidContentException.class).isThrownBy(() -> loader.load(List.of(from, to)))
			.satisfies(ex -> assertThat(ex.problems()).anySatisfy(
					problem -> assertThat(problem).contains("key belongs to set move-from")));

		assertThat(activeCardKeysInOrder("move-from")).containsExactly("move-a", "move-b");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM sets WHERE set_key = 'move-to'", Integer.class))
			.isZero();
	}

	@Test
	void brokenContentChangesNothing() {
		CardDefinition a = card("broken-a", "Question A?");
		loader.load(List.of(set("broken", "Broken", a)));
		CardDefinition threeIdeas = new CardDefinition(a.key(), a.question(), "A new answer.", List.of("One", "Two", "Three"),
				a.explanation(), a.memoryHook(), a.source());

		assertThatExceptionOfType(InvalidContentException.class)
			.isThrownBy(() -> loader.load(List.of(set("broken", "Broken", threeIdeas))));

		assertThat(cardRow("broken-a").get("answer")).isEqualTo("Answer for broken-a.");
		assertThat(cardRow("broken-a").get("content_version")).isEqualTo(1);
	}

	@Test
	void aSharedCardWithoutASourceCannotReplacePublishedContent() {
		CardDefinition original = card("source-required", "An existing question?");
		loader.load(List.of(set("source-required-set", "Existing Set", original)));
		CardDefinition unsourced = edit(original, original.question(), "A changed answer.", List.of(), null, null, null);

		assertThatExceptionOfType(InvalidContentException.class)
			.isThrownBy(() -> loader.load(List.of(set("source-required-set", "Changed Set", unsourced))))
			.satisfies(ex -> assertThat(ex.problems())
				.anySatisfy(problem -> assertThat(problem).contains("source is missing")));

		assertThat(cardRow(original.key()).get("answer")).isEqualTo(original.answer());
		assertThat(cardRow(original.key()).get("source")).isEqualTo(original.source());
		assertThat(cardRow(original.key()).get("content_version")).isEqualTo(1);
		assertThat(setRow("source-required-set").get("title")).isEqualTo("Existing Set");
	}

	@Test
	void sharedSetsAndCardsCanNeverBeDeleted() {
		loader.load(List.of(set("guarded", "Guarded", card("guarded-a", "Question A?"))));
		long cardId = cardId("guarded-a");
		long setId = setId("guarded");

		assertThatExceptionOfType(DataAccessException.class)
			.isThrownBy(() -> jdbc.update("DELETE FROM cards WHERE id = ?", cardId));
		assertThatExceptionOfType(DataAccessException.class)
			.isThrownBy(() -> jdbc.update("DELETE FROM sets WHERE id = ?", setId));
		assertThat(jdbc.queryForObject("SELECT count(*) FROM cards WHERE id = ?", Integer.class, cardId)).isOne();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM sets WHERE id = ?", Integer.class, setId)).isOne();
	}

	private static SetDefinition set(String key, String title, CardDefinition... cards) {
		return new SetDefinition(key + ".yaml", key, title, "A set for tests.", "Revue", "Science", Arrays.asList(cards));
	}

	private static CardDefinition card(String key, String question) {
		return new CardDefinition(key, question, "Answer for " + key + ".", List.of("First idea", "Second idea"),
				"Explanation for " + key + ".", null, "Source for " + key + ".");
	}

	private static Arguments correction(String field, @Nullable String startingHook, UnaryOperator<CardDefinition> correct,
			String column, Object expected) {
		return Arguments.of(field, startingHook, correct, column, expected);
	}

	private static CardDefinition edit(CardDefinition card, String question, String answer, List<String> keyIdeas,
			@Nullable String explanation, @Nullable String memoryHook, @Nullable String source) {
		return new CardDefinition(card.key(), question, answer, keyIdeas, explanation, memoryHook, source);
	}

	private static CardDefinition withHook(CardDefinition card, @Nullable String memoryHook) {
		return edit(card, card.question(), card.answer(), card.keyIdeas(), card.explanation(), memoryHook,
				card.source());
	}

	private Map<String, Object> setRow(String setKey) {
		return jdbc.queryForMap("SELECT * FROM sets WHERE set_key = ?", setKey);
	}

	private long setId(String setKey) {
		return ((Number) setRow(setKey).get("id")).longValue();
	}

	private Map<String, Object> cardRow(String contentKey) {
		return jdbc.queryForMap("SELECT * FROM cards WHERE content_key = ?", contentKey);
	}

	private long cardId(String contentKey) {
		return ((Number) cardRow(contentKey).get("id")).longValue();
	}

	private List<String> keyIdeas(String contentKey) {
		return jdbc.queryForObject("SELECT key_ideas FROM cards WHERE content_key = ?",
				(rs, row) -> Arrays.asList((String[]) rs.getArray(1).getArray()), contentKey);
	}

	private List<String> cardKeysInOrder(String setKey) {
		return jdbc.queryForList("SELECT c.content_key FROM cards c JOIN sets s ON s.id = c.set_id"
				+ " WHERE s.set_key = ? ORDER BY c.position, c.id", String.class, setKey);
	}

	private List<String> activeCardKeysInOrder(String setKey) {
		return jdbc.queryForList("SELECT c.content_key FROM cards c JOIN sets s ON s.id = c.set_id"
				+ " WHERE s.set_key = ? AND c.retired_at IS NULL ORDER BY c.position, c.id", String.class, setKey);
	}

}
