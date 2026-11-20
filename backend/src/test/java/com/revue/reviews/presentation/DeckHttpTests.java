package com.revue.reviews.presentation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.revue.StructuredEvents;
import com.revue.TestcontainersConfiguration;
import com.revue.reviews.application.DeckService;
import com.revue.reviews.application.DeckStore;
import com.revue.reviews.domain.CardText;
import com.revue.reviews.domain.DeckTitle;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(properties = "revue.content.publish=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ExtendWith(OutputCaptureExtension.class)
class DeckHttpTests {
    private static final String PRIVATE_TEXT = "private-deck-content-sentinel";
    @Autowired
    MockMvc mvc;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    DeckStore store;
    @Autowired
    PlatformTransactionManager transactions;
    @MockitoBean
    Clock clock;
    private final JsonMapper json = JsonMapper.builder().build();
    private final AtomicReference<Instant> now = new AtomicReference<>();

    @BeforeEach
    void setTime() {
        now.set(Instant.parse("2026-11-16T04:00:00Z"));
        when(clock.instant()).thenAnswer(_ -> now.get());
    }

    @Test
    void writesNamingAnotherLearnerAreRefusedBeforeTheyReachThisAccount(CapturedOutput output) throws Exception {
        var learner = new Browser();
        var refused = learner.send(
            post("/api/v1/decks").header("X-Revue-Learner", "first_learner"),
            Map.of("title", "First learner's deck"));
        assertThat(refused.getResponse().getStatus()).isEqualTo(403);
        assertThat(jdbc.queryForObject("select count(*) from decks where owner_id = ?", Integer.class, learner.id))
            .isZero();
        assertThat(StructuredEvents.named(output, "auth.access_denied")).singleElement()
            .satisfies(event -> assertThat(event.at("/event/reason").asString()).isEqualTo("learner_mismatch"));
        assertThat(output.getOut()).doesNotContain("first_learner", learner.username);

        var own = learner
            .send(post("/api/v1/decks").header("X-Revue-Learner", learner.username), Map.of("title", "Own deck"));
        assertThat(own.getResponse().getStatus()).isEqualTo(201);
    }

    @Test
    void decksAreCreatedRenamedAndListedOnlyForTheirOwner(CapturedOutput output) throws Exception {
        var owner = new Browser();
        var other = new Browser();
        var created = owner.send(post("/api/v1/decks"), Map.of("title", "  " + PRIVATE_TEXT + "  "));
        assertThat(created.getResponse().getStatus()).isEqualTo(201);
        assertThat(created.getResponse().getHeader("Cache-Control")).contains("no-store", "private");
        JsonNode deck = body(created);
        assertThat(deck.get("title").asString()).isEqualTo(PRIVATE_TEXT);
        assertThat(deck.get("cardCount").asLong()).isZero();
        String deckPath = "/api/v1/decks/" + deck.get("id").asString();

        assertThat(body(other.send(get("/api/v1/decks"))).get("items").isEmpty()).isTrue();
        assertThat(other.send(patch(deckPath), Map.of("title", "Taken")).getResponse().getStatus()).isEqualTo(404);
        assertThat(other.send(get(deckPath + "/cards")).getResponse().getStatus()).isEqualTo(404);
        assertThat(other.send(post(deckPath + "/cards"), card("Question", "Answer")).getResponse().getStatus())
            .isEqualTo(404);
        assertThat(other.send(delete(deckPath)).getResponse().getStatus()).isEqualTo(404);

        assertThat(owner.send(patch(deckPath), Map.of("title", " ")).getResponse().getStatus()).isEqualTo(422);
        assertThat(
            owner.send(patch(deckPath), Map.of("title", "x".repeat(DeckTitle.MAX_LENGTH + 1)))
                .getResponse()
                .getStatus())
            .isEqualTo(422);
        var renamed = body(owner.send(patch(deckPath), Map.of("title", "Biology quiz")));
        assertThat(renamed.get("title").asString()).isEqualTo("Biology quiz");
        var listed = body(owner.send(get("/api/v1/decks"))).get("items");
        assertThat(listed.size()).isEqualTo(1);
        assertThat(listed.get(0).get("title").asString()).isEqualTo("Biology quiz");

        var events = StructuredEvents.named(output, "deck.created");
        assertThat(events).hasSize(1);
        assertThat(events.getFirst().at("/actor/id").asString()).isEqualTo(owner.id.toString());
        assertThat(events.getFirst().at("/entity/id").asString()).isEqualTo(deck.get("id").asString());
        assertThat(events.getFirst().at("/operation/id").asString()).isNotBlank();
        assertThat(output.getAll()).doesNotContain(PRIVATE_TEXT);
    }

    @Test
    void deckNamesAllowFiftyCharactersAndRejectLongerWrites() throws Exception {
        var owner = new Browser();
        String title = "x".repeat(50);
        assertThat(owner.send(post("/api/v1/decks"), Map.of("title", title + "x")).getResponse().getStatus())
            .isEqualTo(422);
        String deckPath = owner.createDeck(title);
        assertThat(owner.send(patch(deckPath), Map.of("title", title + "x")).getResponse().getStatus()).isEqualTo(422);
        assertThat(body(owner.send(get("/api/v1/decks"))).get("items").get(0).get("title").asString()).isEqualTo(title);
    }

    @Test
    void anotherLearnerCannotReadEditOrRateAnOwnersScheduledCard() throws Exception {
        var owner = new Browser();
        String deck = owner.createDeck("Owner only");
        final long cardId = owner.addRatedCard(deck, PRIVATE_TEXT);
        now.set(Instant.parse("2027-01-01T00:00:00Z"));
        var ownerRead = owner.send(get(deck + "/cards"));
        assertThat(ownerRead.getResponse().getStatus()).isEqualTo(200);
        final var original = body(ownerRead);
        assertThat(original.at("/items/0/question").asString()).isEqualTo(PRIVATE_TEXT);
        final var schedule = jdbc.queryForMap("select * from schedules where card_id = ?", cardId);
        final var history = jdbc.queryForList("select * from review_logs where card_id = ?", cardId);

        var other = new Browser();
        var read = other.send(get(deck + "/cards"));
        assertPrivateCardHidden(read);
        var edit = other
            .send(patch("/api/v1/cards/" + cardId).header("X-Content-Version", 1), card("Changed", "Changed"));
        assertPrivateCardHidden(edit);
        var rating = other.rate(cardId, 1);
        assertPrivateCardHidden(rating);

        assertThat(body(owner.send(get(deck + "/cards")))).isEqualTo(original);
        assertThat(jdbc.queryForMap("select * from schedules where card_id = ?", cardId)).isEqualTo(schedule);
        assertThat(jdbc.queryForList("select * from review_logs where card_id = ?", cardId)).isEqualTo(history);
    }

    @Test
    void listsOnlyOwnedDecksWithExactCountsIncludingEmptyDecks() throws Exception {
        var owner = new Browser();
        var other = new Browser();
        final String first = owner.createDeck("Empty");
        String populated = owner.createDeck("Populated");
        String privateDeck = other.createDeck("Other learner");
        owner.send(post(populated + "/cards"), card("Question 1", "Answer 1"));
        owner.send(post(populated + "/cards"), card("Question 2", "Answer 2"));
        other.send(post(privateDeck + "/cards"), card("Question", "Answer"));

        var items = body(owner.send(get("/api/v1/decks"))).get("items");
        assertThat(items.size()).isEqualTo(2);
        assertThat(first).endsWith("/" + items.get(0).get("id").asString());
        assertThat(items.get(0).get("cardCount").asLong()).isZero();
        assertThat(populated).endsWith("/" + items.get(1).get("id").asString());
        assertThat(items.get(1).get("cardCount").asLong()).isEqualTo(2);
    }

    @Test
    void cardTextIsCheckedAndTrimmedWithoutLoggingIt(CapturedOutput output) throws Exception {
        var owner = new Browser();
        String cardsPath = owner.createDeck("Chemistry") + "/cards";

        assertThat(owner.send(post(cardsPath), card(" ", "Answer")).getResponse().getStatus()).isEqualTo(422);
        assertThat(owner.send(post(cardsPath), Map.of("question", "Question")).getResponse().getStatus())
            .isEqualTo(422);
        assertThat(
            owner.send(post(cardsPath), card("Question", "x".repeat(CardText.MAX_ANSWER + 1)))
                .getResponse()
                .getStatus())
            .isEqualTo(422);
        var longest = owner
            .send(post(cardsPath), card("q".repeat(CardText.MAX_QUESTION), "a".repeat(CardText.MAX_ANSWER)));
        assertThat(longest.getResponse().getStatus()).isEqualTo(201);

        var draft = new HashMap<>(card("  " + PRIVATE_TEXT + "  ", " Line one\nLine two "));
        draft.put("explanation", "   ");
        draft.put("memoryHook", " Hook ");
        var added = body(owner.send(post(cardsPath), draft));
        assertThat(added.get("question").asString()).isEqualTo(PRIVATE_TEXT);
        assertThat(added.get("answer").asString()).isEqualTo("Line one\nLine two");
        assertThat(added.get("explanation").isNull()).isTrue();
        assertThat(added.get("memoryHook").asString()).isEqualTo("Hook");
        assertThat(added.get("source").isNull()).isTrue();
        assertThat(added.get("contentVersion").asInt()).isEqualTo(1);

        assertThat(StructuredEvents.named(output, "card.created")).hasSize(2);
        assertThat(output.getAll()).doesNotContain(PRIVATE_TEXT);
    }

    @Test
    void shortensNewAnswersWithoutBlockingEditsToOtherFieldsOnLegacyCards() throws Exception {
        var owner = new Browser();
        String cardsPath = owner.createDeck("Cell biology") + "/cards";
        var added = body(owner.send(post(cardsPath), card("Question", "Answer")));
        String cardId = added.get("id").asString();
        String path = "/api/v1/cards/" + cardId;
        String legacyAnswer = "a".repeat(450);
        jdbc.update("update cards set answer = ? where id = ?", legacyAnswer, Long.parseLong(cardId));

        assertThat(owner.send(post(cardsPath), card("Second question", "a".repeat(301))).getResponse().getStatus())
            .isEqualTo(422);
        var kept = owner.send(patch(path).header("X-Content-Version", 1), card("Edited question", legacyAnswer));
        assertThat(kept.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(kept).get("answer").asString()).isEqualTo(legacyAnswer);
        var stillTooLong = owner
            .send(patch(path).header("X-Content-Version", 2), card("Edited question", "b".repeat(301)));
        assertThat(stillTooLong.getResponse().getStatus()).isEqualTo(422);
        var shortened = owner
            .send(patch(path).header("X-Content-Version", 2), card("Edited question", "b".repeat(300)));
        assertThat(shortened.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(shortened).get("answer").asString()).hasSize(300);
    }

    @Test
    void nullCharactersAreRejectedInDeckNamesAndEveryCardFieldWithoutChangingData(CapturedOutput output)
        throws Exception {
        var owner = new Browser();
        String deckPath = owner.createDeck("Valid name");
        String cardsPath = deckPath + "/cards";
        var original = body(owner.send(post(cardsPath), card("Valid question", "Valid answer")));
        String cardPath = "/api/v1/cards/" + original.get("id").asString();
        String invalidText = PRIVATE_TEXT + '\0' + "tail";

        for (var request : List.of(post("/api/v1/decks"), patch(deckPath))) {
            var rejected = owner.send(request, Map.of("title", invalidText));
            assertThat(rejected.getResponse().getStatus()).isEqualTo(422);
            assertThat(body(rejected).get("reason").asString()).isEqualTo("INVALID_TEXT");
        }
        for (String field : List.of("question", "answer", "explanation", "memoryHook", "source")) {
            var draft = new HashMap<>(card("Valid question", "Valid answer"));
            draft.put(field, invalidText);
            for (var request : List.of(post(cardsPath), patch(cardPath))) {
                var rejected = owner.send(request, draft);
                assertThat(rejected.getResponse().getStatus()).isEqualTo(422);
                assertThat(body(rejected).get("reason").asString()).isEqualTo("INVALID_TEXT");
            }
        }

        var page = body(owner.send(get(cardsPath)));
        assertThat(page.get("deck").get("title").asString()).isEqualTo("Valid name");
        assertThat(page.get("items").size()).isEqualTo(1);
        assertThat(page.get("items").get(0)).isEqualTo(original);
        assertThat(body(owner.send(get("/api/v1/decks"))).get("items").size()).isEqualTo(1);
        assertThat(StructuredEvents.named(output, "card.edited")).isEmpty();
        assertThat(StructuredEvents.named(output, "card.created")).hasSize(1);
        assertThat(StructuredEvents.named(output, "deck.created")).hasSize(1);
        assertThat(output.getAll()).doesNotContain(PRIVATE_TEXT);
    }

    @Test
    void cardPagesKeepTheDeckSummaryForEmptyAndExhaustedCursors() throws Exception {
        var owner = new Browser();
        String cardsPath = owner.createDeck("Chemistry") + "/cards";
        var emptyPage = body(owner.send(get(cardsPath)));
        assertThat(emptyPage.get("deck").get("title").asString()).isEqualTo("Chemistry");
        assertThat(emptyPage.get("deck").get("cardCount").asLong()).isZero();
        assertThat(emptyPage.get("items").isEmpty()).isTrue();
        assertThat(emptyPage.get("nextCursor").isNull()).isTrue();

        var first = body(owner.send(post(cardsPath), card("First question", "First answer")));
        var second = body(owner.send(post(cardsPath), card("Second question", "Second answer")));
        var firstPage = body(owner.send(get(cardsPath + "?limit=1")));
        assertThat(firstPage.get("deck").get("cardCount").asLong()).isEqualTo(2);
        assertThat(firstPage.get("items").size()).isEqualTo(1);
        assertThat(firstPage.get("nextCursor").asString()).isEqualTo(first.get("id").asString());
        var secondPage = body(owner.send(get(cardsPath + "?limit=1&after=" + firstPage.get("nextCursor").asString())));
        assertThat(secondPage.get("deck").get("cardCount").asLong()).isEqualTo(2);
        assertThat(secondPage.get("items").get(0).get("id").asString()).isEqualTo(second.get("id").asString());
        assertThat(secondPage.get("nextCursor").isNull()).isTrue();
        var exhaustedPage = body(owner.send(get(cardsPath + "?after=" + second.get("id").asString())));
        assertThat(exhaustedPage.get("deck").get("cardCount").asLong()).isEqualTo(2);
        assertThat(exhaustedPage.get("items").isEmpty()).isTrue();
        assertThat(exhaustedPage.get("nextCursor").isNull()).isTrue();
        assertThat(owner.send(get(cardsPath + "?limit=101")).getResponse().getStatus()).isEqualTo(400);
        assertThat(owner.send(get(cardsPath + "?after=-1")).getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void cardSearchFiltersTheOwnedDeckBeforeApplyingItsCursorAndLimit(CapturedOutput output) throws Exception {
        var owner = new Browser();
        String cardsPath = owner.createDeck("Chemistry") + "/cards";
        owner.send(post(cardsPath), card("Earlier question", "Earlier answer"));
        final var questionMatch = body(owner.send(post(cardsPath), card(PRIVATE_TEXT + " 50%", "Question match")));
        final var answerMatch = body(owner.send(post(cardsPath), card("Later question", PRIVATE_TEXT + " half")));
        String otherDeck = owner.createDeck("Other deck") + "/cards";
        owner.send(post(otherDeck), card(PRIVATE_TEXT, "Another deck must not contribute"));

        var first = body(
            owner.send(get(cardsPath).param("q", "  PRIVATE-DECK-CONTENT-SENTINEL  ").param("limit", "1")));
        assertThat(first.get("deck").get("cardCount").asLong()).isEqualTo(3);
        assertThat(first.get("items").size()).isEqualTo(1);
        assertThat(first.get("items").get(0).get("id").asString()).isEqualTo(questionMatch.get("id").asString());
        assertThat(first.get("nextCursor").asString()).isEqualTo(questionMatch.get("id").asString());

        var second = body(
            owner.send(
                get(cardsPath).param("q", PRIVATE_TEXT)
                    .param("limit", "1")
                    .param("after", first.get("nextCursor").asString())));
        assertThat(second.get("items").size()).isEqualTo(1);
        assertThat(second.get("items").get(0).get("id").asString()).isEqualTo(answerMatch.get("id").asString());
        assertThat(second.get("nextCursor").isNull()).isTrue();

        var literal = body(owner.send(get(cardsPath).param("q", "%")));
        assertThat(literal.get("items").size()).isEqualTo(1);
        assertThat(literal.get("items").get(0).get("id").asString()).isEqualTo(questionMatch.get("id").asString());
        assertThat(body(owner.send(get(cardsPath).param("q", "absent"))).get("items").isEmpty()).isTrue();
        var other = new Browser();
        assertThat(other.send(get(cardsPath).param("q", PRIVATE_TEXT)).getResponse().getStatus()).isEqualTo(404);
        assertThat(owner.send(get(cardsPath).param("q", "x".repeat(201))).getResponse().getStatus()).isEqualTo(400);
        assertThat(output.getAll()).doesNotContain(PRIVATE_TEXT);
    }

    @Test
    void cardEditsVersionOnlyChangedTextAndStayPrivate(CapturedOutput output) throws Exception {
        var owner = new Browser();
        String cardsPath = owner.createDeck("Chemistry") + "/cards";
        var draft = new HashMap<>(card(PRIVATE_TEXT, "Original answer"));
        draft.put("memoryHook", "Hook");
        var added = body(owner.send(post(cardsPath), draft));
        String cardPath = "/api/v1/cards/" + added.get("id").asString();
        var edited = body(
            owner.send(patch(cardPath).header("X-Content-Version", 1), card(PRIVATE_TEXT, "A corrected answer")));
        assertThat(edited.get("answer").asString()).isEqualTo("A corrected answer");
        assertThat(edited.get("memoryHook").isNull()).isTrue();
        assertThat(edited.get("contentVersion").asInt()).isEqualTo(2);
        var stale = owner
            .send(patch(cardPath).header("X-Content-Version", 1), card("Changed question", "Original answer"));
        assertThat(stale.getResponse().getStatus()).isEqualTo(409);
        assertThat(body(stale).get("reason").asString()).isEqualTo("STALE_CARD");
        assertThat(owner.send(patch(cardPath), card("Unversioned", "Change")).getResponse().getStatus()).isEqualTo(409);
        var unchanged = body(
            owner
                .send(patch(cardPath).header("X-Content-Version", 2), card(" " + PRIVATE_TEXT, "A corrected answer ")));
        assertThat(unchanged.get("contentVersion").asInt()).isEqualTo(2);
        assertThat(owner.send(patch(cardPath), card("", "Answer")).getResponse().getStatus()).isEqualTo(422);

        var other = new Browser();
        assertThat(other.send(patch(cardPath), card("Stolen", "Answer")).getResponse().getStatus()).isEqualTo(404);
        assertThat(other.send(delete(cardPath)).getResponse().getStatus()).isEqualTo(404);
        String sharedCardPath = "/api/v1/cards/" + sharedCard();
        assertThat(owner.send(patch(sharedCardPath), card("Changed", "Answer")).getResponse().getStatus())
            .isEqualTo(404);
        assertThat(owner.send(delete(sharedCardPath)).getResponse().getStatus()).isEqualTo(404);

        var edits = StructuredEvents.named(output, "card.edited");
        assertThat(edits).hasSize(1);
        assertThat(edits.getFirst().at("/state/from").asString()).isEqualTo("1");
        assertThat(edits.getFirst().at("/state/to").asString()).isEqualTo("2");
        assertThat(StructuredEvents.named(output, "card.created")).hasSize(1);
        assertThat(output.getAll()).doesNotContain(PRIVATE_TEXT);
    }

    @Test
    void personalCardsEnterTodayUnderTheDailyAllowanceAndReturnOnTheirNextDate() throws Exception {
        var owner = new Browser();
        String cardsPath = owner.createDeck("Class handout") + "/cards";
        for (int number = 1; number <= 11; number++) {
            owner.send(post(cardsPath), card("Question " + number, "Answer " + number));
        }

        var queue = body(owner.send(get("/api/v1/cards/due")));
        assertThat(queue.get("totalCards").asInt()).isEqualTo(11);
        assertThat(queue.get("newCards").asInt()).isEqualTo(10);
        assertThat(queue.get("cards").size()).isEqualTo(5);
        JsonNode first = queue.get("cards").get(0);
        assertThat(first.get("question").asString()).isEqualTo("Question 1");
        assertThat(first.get("setTitle").asString()).isEqualTo("Class handout");
        assertThat(first.get("publisherName").isNull()).isTrue();
        assertThat(first.get("source").isNull()).isTrue();
        assertThat(first.get("keyIdeas").isEmpty()).isTrue();
        var other = new Browser();
        assertThat(body(other.send(get("/api/v1/cards/due"))).get("totalCards").asInt()).isZero();

        var cardIds = jdbc.queryForList("""
            select c.id from cards c join decks d on d.id = c.deck_id where d.owner_id = ? order by c.id
            """, Long.class, owner.id);
        assertThat(other.rate(cardIds.getFirst(), 0).getResponse().getStatus()).isEqualTo(404);
        var rated = owner.rate(cardIds.getFirst(), 0);
        assertThat(rated.getResponse().getStatus()).isEqualTo(200);
        LocalDate nextReview = LocalDate.parse(body(rated).get("nextReviewDate").asString());
        assertThat(nextReview).isAfter(LocalDate.of(2026, 11, 16));
        for (long cardId : cardIds.subList(1, 10)) {
            assertThat(owner.rate(cardId, 0).getResponse().getStatus()).isEqualTo(200);
        }
        var overAllowance = owner.rate(cardIds.getLast(), 0);
        assertThat(overAllowance.getResponse().getStatus()).isEqualTo(409);
        assertThat(body(overAllowance).get("reason").asString()).isEqualTo("DAILY_LIMIT");
        var afterStudy = body(owner.send(get("/api/v1/cards/due")));
        assertThat(afterStudy.get("newCards").asInt()).isZero();
        assertThat(afterStudy.get("dueCards").asInt()).isZero();
        assertThat(afterStudy.get("cards").isEmpty()).isTrue();

        now.set(nextReview.atStartOfDay(java.time.ZoneId.of("Asia/Manila")).toInstant());
        var onNextDate = body(owner.send(get("/api/v1/cards/due")));
        assertThat(onNextDate.get("dueCards").asInt()).isPositive();
        assertThat(onNextDate.get("newCards").asInt()).isEqualTo(1);
    }

    @Test
    void deckPagesReportTheDailyNewCardAllowanceSharedByAllDecks() throws Exception {
        var owner = new Browser();
        String studiedDeck = owner.createDeck("Studied deck") + "/cards";
        String otherDeck = owner.createDeck("Other deck") + "/cards";
        for (int number = 1; number <= 10; number++) {
            owner.send(post(studiedDeck), card("Question " + number, "Answer " + number));
        }
        owner.send(post(otherDeck), card("Untouched question", "Answer"));
        assertThat(newCardsLeftToday(owner, otherDeck)).isEqualTo(10);
        owner.send(get("/api/v1/cards/due"));

        var studied = jdbc.queryForList("""
            select c.id from cards c join decks d on d.id = c.deck_id
            where d.owner_id = ? and d.title = 'Studied deck' order by c.id
            """, Long.class, owner.id);
        assertThat(owner.rate(studied.getFirst(), 0).getResponse().getStatus()).isEqualTo(200);
        assertThat(newCardsLeftToday(owner, otherDeck)).isEqualTo(9);
        for (long cardId : studied.subList(1, 10)) {
            assertThat(owner.rate(cardId, 0).getResponse().getStatus()).isEqualTo(200);
        }
        var atLimit = body(owner.send(get(otherDeck))).get("progress");
        assertThat(atLimit.get("newCardsLeftToday").asInt()).isZero();
        assertThat(atLimit.get("newCards").asInt()).isEqualTo(1);

        now.set(now.get().plus(Duration.ofDays(1)));
        assertThat(newCardsLeftToday(owner, otherDeck)).isEqualTo(10);
    }

    private int newCardsLeftToday(Browser learner, String cardsPath) throws Exception {
        return body(learner.send(get(cardsPath))).get("progress").get("newCardsLeftToday").asInt();
    }

    @Test
    void deckPagesReportDueCardsAndFilterToThemUntilTheDeckIsPaused() throws Exception {
        var owner = new Browser();
        String path = owner.createDeck("Exam notes");
        long rated = owner.addRatedCard(path, "Capital city");
        owner.send(post(path + "/cards"), card("Unstarted question", "Answer"));
        LocalDate nextReview = jdbc
            .queryForObject("select next_review_date from schedules where card_id = ?", LocalDate.class, rated);

        var beforeDue = body(owner.send(get(path + "/cards")));
        assertThat(beforeDue.get("progress").get("dueCards").asInt()).isZero();
        assertThat(beforeDue.get("progress").get("newCards").asInt()).isEqualTo(1);
        assertThat(beforeDue.get("progress").get("nextReviewDate").asString()).isEqualTo(nextReview.toString());
        assertThat(beforeDue.get("dueCardIds").isEmpty()).isTrue();
        assertThat(body(owner.send(get(path + "/cards?due=true"))).get("items").isEmpty()).isTrue();

        now.set(nextReview.atStartOfDay(java.time.ZoneId.of("Asia/Manila")).toInstant());
        var onDueDate = body(owner.send(get(path + "/cards")));
        assertThat(onDueDate.get("progress").get("dueCards").asInt()).isEqualTo(1);
        assertThat(onDueDate.get("progress").get("nextReviewDate").isNull()).isTrue();
        assertThat(onDueDate.get("items").size()).isEqualTo(2);
        assertThat(onDueDate.get("dueCardIds").get(0).asString()).isEqualTo(Long.toString(rated));
        var dueOnly = body(owner.send(get(path + "/cards?due=true&q=capital")));
        assertThat(dueOnly.get("items").size()).isEqualTo(1);
        assertThat(dueOnly.get("items").get(0).get("question").asString()).isEqualTo("Capital city");

        assertThat(owner.send(put(path + "/archive")).getResponse().getStatus()).isEqualTo(204);
        var paused = body(owner.send(get(path + "/cards")));
        assertThat(paused.get("progress").get("dueCards").asInt()).isZero();
        assertThat(paused.get("progress").get("newCards").asInt()).isZero();
        assertThat(paused.get("progress").get("nextReviewDate").isNull()).isTrue();
        assertThat(paused.get("dueCardIds").isEmpty()).isTrue();
        assertThat(body(owner.send(get(path + "/cards?due=true"))).get("items").isEmpty()).isTrue();
    }

    @Test
    void archivingAndRestoringPreservesDueDatesAndBlocksReviewsFromAnOpenTab(CapturedOutput output) throws Exception {
        var owner = new Browser();
        var other = new Browser();
        String path = owner.createDeck("Exam notes");
        String archive = path + "/archive";
        long cardId = owner.addRatedCard(path, "Capital city");
        owner.send(post(path + "/cards"), card("Unstarted question", "Answer"));
        final var schedule = jdbc.queryForMap("select * from schedules where card_id = ?", cardId);
        final var history = jdbc.queryForMap("select * from review_logs where card_id = ?", cardId);
        final long kept = owner.addRatedCard(owner.createDeck("Still studying"), "Unrelated");
        assertThat(other.send(put(archive)).getResponse().getStatus()).isEqualTo(404);
        assertThat(owner.send(put(archive)).getResponse().getStatus()).isEqualTo(204);
        assertThat(owner.send(put(archive)).getResponse().getStatus()).isEqualTo(204);
        now.set(Instant.parse("2027-01-01T00:00:00Z"));
        var today = body(owner.send(get("/api/v1/cards/due")));
        assertThat(today.get("totalCards").asInt()).isEqualTo(1);
        assertThat(today.at("/cards/0/id").asLong()).isEqualTo(kept);
        String topic = "deck-" + path.substring(path.lastIndexOf('/') + 1);
        var scoped = body(owner.send(get("/api/v1/cards/due").param("topic", topic).param("includeNew", "true")));
        assertThat(scoped.get("availableCards").asInt()).isZero();
        assertThat(owner.rate(cardId, 0).getResponse().getStatus()).isEqualTo(404);
        var archived = body(owner.send(get(path + "/cards")));
        assertThat(archived.at("/deck/archived").asBoolean()).isTrue();
        assertThat(archived.get("items").size()).isEqualTo(2);
        assertThat(other.send(delete(archive)).getResponse().getStatus()).isEqualTo(404);
        assertThat(owner.send(delete(archive)).getResponse().getStatus()).isEqualTo(204);
        assertThat(owner.send(delete(archive)).getResponse().getStatus()).isEqualTo(204);
        var restored = body(owner.send(get("/api/v1/cards/due").param("topic", topic).param("includeNew", "true")));
        assertThat(restored.get("dueCards").asInt()).isEqualTo(1);
        assertThat(restored.get("newCards").asInt()).isEqualTo(1);
        assertThat(restored.at("/cards/0/id").asLong()).isEqualTo(cardId);
        assertThat(jdbc.queryForMap("select * from schedules where card_id = ?", cardId)).isEqualTo(schedule);
        assertThat(jdbc.queryForMap("select * from review_logs where card_id = ?", cardId)).isEqualTo(history);
        assertThat(StructuredEvents.named(output, "deck.archived")).hasSize(1);
        assertThat(StructuredEvents.named(output, "deck.restored")).hasSize(1);
    }

    @Test
    void createRetriesAreScopedToTheirOwnerAndCannotRecreateDeletedMaterial() throws Exception {
        var owner = new Browser();
        var other = new Browser();
        var key = UUID.randomUUID().toString();
        var title = Map.of("title", "Finals");
        var deck = body(owner.send(post("/api/v1/decks").header("Idempotency-Key", key), title));
        var replay = body(owner.send(post("/api/v1/decks").header("Idempotency-Key", key), title));
        assertThat(replay).isEqualTo(deck);
        var independent = body(other.send(post("/api/v1/decks").header("Idempotency-Key", key), title));
        assertThat(independent.get("id")).isNotEqualTo(deck.get("id"));
        String deckPath = "/api/v1/decks/" + deck.get("id").asString();
        String path = deckPath + "/cards";
        var cardKey = UUID.randomUUID().toString();
        var draft = card("Capital", "City");
        var created = body(owner.send(post(path).header("Idempotency-Key", cardKey), draft));
        assertThat(body(owner.send(post(path).header("Idempotency-Key", cardKey), draft))).isEqualTo(created);
        assertThat(
            owner.send(post(path).header("Idempotency-Key", cardKey), card("Other", "City")).getResponse().getStatus())
            .isEqualTo(409);
        var corrected = card("Capital", "Edited city");
        var edited = body(
            owner.send(
                patch("/api/v1/cards/" + created.get("id").asString()).header("X-Content-Version", 1),
                corrected));
        assertThat(body(owner.send(post(path).header("Idempotency-Key", cardKey), draft))).isEqualTo(edited);
        assertThat(owner.send(post(path).header("Idempotency-Key", cardKey), corrected).getResponse().getStatus())
            .isEqualTo(409);
        var renamedTitle = Map.of("title", "After finals");
        var renamed = body(owner.send(patch(deckPath), renamedTitle));
        assertThat(body(owner.send(post("/api/v1/decks").header("Idempotency-Key", key), title))).isEqualTo(renamed);
        assertThat(
            owner.send(post("/api/v1/decks").header("Idempotency-Key", key), renamedTitle).getResponse().getStatus())
            .isEqualTo(409);
        owner.send(delete("/api/v1/cards/" + created.get("id").asString()));
        assertThat(owner.send(post(path).header("Idempotency-Key", cardKey), draft).getResponse().getStatus())
            .isEqualTo(409);
        owner.send(delete(deckPath));
        assertThat(owner.send(post("/api/v1/decks").header("Idempotency-Key", key), title).getResponse().getStatus())
            .isEqualTo(409);
        assertThat(store.countDecks(owner.id)).isZero();
    }

    @Test
    void deletingCardsOrDecksRemovesOnlyTheirOwnReviewHistory(CapturedOutput output) throws Exception {
        var other = new Browser();
        final String keptDeckPath = other.createDeck("Kept");
        final long keptCard = other.addRatedCard(keptDeckPath, "Kept");
        var owner = new Browser();
        final String deckPath = owner.createDeck("Wrong handout");
        long firstCard = owner.addRatedCard(deckPath, "First");
        final long secondCard = owner.addRatedCard(deckPath, "Second");

        assertThat(owner.send(delete("/api/v1/cards/" + firstCard)).getResponse().getStatus()).isEqualTo(204);
        assertThat(owner.send(delete("/api/v1/cards/" + firstCard)).getResponse().getStatus()).isEqualTo(404);
        assertThat(rowsFor("review_logs", firstCard)).isZero();
        assertThat(rowsFor("schedules", firstCard)).isZero();
        assertThat(rowsFor("review_logs", secondCard)).isEqualTo(1);
        assertThat(owner.rate(firstCard, 0).getResponse().getStatus()).isEqualTo(404);
        assertThat(body(owner.send(get(deckPath + "/cards"))).get("deck").get("cardCount").asLong()).isEqualTo(1);

        assertThat(owner.send(delete(deckPath)).getResponse().getStatus()).isEqualTo(204);
        assertThat(owner.send(delete(deckPath)).getResponse().getStatus()).isEqualTo(404);
        assertThat(rowsFor("review_logs", secondCard)).isZero();
        assertThat(rowsFor("schedules", secondCard)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from decks where owner_id = ?", Integer.class, owner.id))
            .isZero();
        assertThat(body(owner.send(get("/api/v1/cards/due"))).get("totalCards").asInt()).isZero();
        assertThat(rowsFor("review_logs", keptCard)).isEqualTo(1);
        assertThat(rowsFor("schedules", keptCard)).isEqualTo(1);
        assertThat(body(other.send(get(keptDeckPath + "/cards"))).get("items").size()).isEqualTo(1);

        assertThat(StructuredEvents.named(output, "card.deleted")).hasSize(1);
        assertThat(StructuredEvents.named(output, "deck.deleted")).hasSize(1);
    }

    @Test
    void accountLimitsHoldUnderConcurrentRequestsAndApplyPerLearner() throws Exception {
        var owner = new Browser();
        jdbc.update("""
            insert into decks(owner_id, title, created_at, updated_at)
            select ?, 'Deck ' || number, now(), now() from generate_series(1, ?) number
            """, owner.id, DeckService.MAX_DECKS_PER_LEARNER - 1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            Callable<Integer> create = () -> owner.send(post("/api/v1/decks"), Map.of("title", "Last deck"))
                .getResponse()
                .getStatus();
            var results = workers.invokeAll(List.of(create, create));
            assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(201, 409);
        }
        var refused = owner.send(post("/api/v1/decks"), Map.of("title", "One too many"));
        assertThat(body(refused).get("reason").asString()).isEqualTo("DECK_LIMIT");

        long deck = jdbc.queryForObject("select min(id) from decks where owner_id = ?", Long.class, owner.id);
        jdbc.update("""
            insert into cards(deck_id, position, question, answer, created_at, updated_at)
            select ?, number, 'Question', 'Answer', now(), now() from generate_series(1, ?) number
            """, deck, DeckService.MAX_CARDS_PER_LEARNER);
        var fullAccount = owner.send(post("/api/v1/decks/" + deck + "/cards"), card("Question", "Answer"));
        assertThat(fullAccount.getResponse().getStatus()).isEqualTo(409);
        assertThat(body(fullAccount).get("reason").asString()).isEqualTo("CARD_LIMIT");

        var other = new Browser();
        String otherDeckPath = other.createDeck("Unaffected");
        assertThat(other.send(post(otherDeckPath + "/cards"), card("Question", "Answer")).getResponse().getStatus())
            .isEqualTo(201);
    }

    @Test
    void everyOperationNeedsSessionCsrfAndCurrentCredentials() throws Exception {
        assertThat(mvc.perform(get("/api/v1/decks")).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(post("/api/v1/decks")).andReturn().getResponse().getStatus()).isEqualTo(403);
        var owner = new Browser();
        String deckPath = owner.createDeck("Protected");
        var withoutCsrf = post(deckPath + "/cards").contentType("application/json")
            .content(json.writeValueAsString(card("Question", "Answer")))
            .cookie(owner.cookies.get("SESSION"));
        assertThat(mvc.perform(withoutCsrf).andReturn().getResponse().getStatus()).isEqualTo(403);

        jdbc.update("update users set credential_version = credential_version + 1 where id = ?", owner.id);
        assertThat(owner.send(post(deckPath + "/cards"), card("Question", "Answer")).getResponse().getStatus())
            .isEqualTo(401);
        assertThat(body(new Browser().send(get("/api/v1/decks"))).get("items").isEmpty()).isTrue();
        assertThat(store.countCards(owner.id)).isZero();
    }

    @Test
    void rolledBackChangesLeaveNoRowsAndNoSuccessEvents(CapturedOutput output) throws Exception {
        var owner = new Browser();
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            var deck = store.createDeck(owner.id, new DeckTitle("Rolled back"), null);
            store.addCard(
                owner.id,
                Long.parseLong(deck.id()),
                new CardText("Question", "Answer", null, null, null),
                null);
            store.importCards(
                owner.id,
                Long.parseLong(deck.id()),
                List.of(new CardText("Imported", "Answer", null, null, null)),
                UUID.randomUUID(),
                new DeckStore.InitialSchedule("profile", "{}"));
            status.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("select count(*) from decks where owner_id = ?", Integer.class, owner.id))
            .isZero();
        assertThat(
            jdbc.queryForObject(
                "select count(*) from deck_import_requests where owner_id = ?",
                Integer.class,
                owner.id))
            .isZero();
        assertThat(StructuredEvents.named(output, "deck.created")).isEmpty();
        assertThat(StructuredEvents.named(output, "card.created")).isEmpty();
        assertThat(StructuredEvents.named(output, "deck.cards_imported")).isEmpty();
    }

    @Test
    void eachCardBelongsToExactlyOneSetOrDeckAndSharedCardsStayProtected() throws Exception {
        var owner = new Browser();
        owner.createDeck("Constraint");
        long deck = jdbc.queryForObject("select id from decks where owner_id = ?", Long.class, owner.id);
        long shared = sharedCard();
        assertThatThrownBy(() -> jdbc.update("update cards set deck_id = ? where id = ?", deck, shared))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update cards set set_id = null where id = ?", shared))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("delete from cards where id = ?", shared))
            .hasMessageContaining("retired, never deleted");
    }

    @Test
    void importedCardsSaveInPreviewOrderWithSchedulesAndAnExactRetryReturnsTheFirstResult(CapturedOutput output)
        throws Exception {
        var owner = new Browser();
        String deckPath = owner.createDeck("Philippine geography");
        owner.send(post(deckPath + "/cards"), card("Already here", "Answer"));
        String key = UUID.randomUUID().toString();
        var rows = pasted(
            card("What is an archipelago?", "A group of islands."),
            card("  What is a strait?  ", "A narrow channel\nbetween two seas."),
            card("What is an isthmus? " + PRIVATE_TEXT, "A narrow strip of land."));

        var imported = owner.send(post(deckPath + "/import").header("Idempotency-Key", key), rows);
        assertThat(imported.getResponse().getStatus()).isEqualTo(201);
        assertThat(imported.getResponse().getHeader("Cache-Control")).contains("no-store");
        assertThat(body(imported).get("importedCards").asInt()).isEqualTo(3);
        var cards = body(owner.send(get(deckPath + "/cards"))).get("items");
        assertThat(cards.valueStream().map(item -> item.get("question").asString())).containsExactly(
            "Already here",
            "What is an archipelago?",
            "What is a strait?",
            "What is an isthmus? " + PRIVATE_TEXT);
        assertThat(cards.get(2).get("answer").asString()).isEqualTo("A narrow channel\nbetween two seas.");
        assertThat(jdbc.queryForObject("""
            select count(*) from schedules s join cards c on c.id = s.card_id
            where s.user_id = ? and c.deck_id = ? and s.version = 0 and s.next_review_date is null
            """, Long.class, owner.id, deckId(deckPath))).isEqualTo(3);

        var retried = owner.send(post(deckPath + "/import").header("Idempotency-Key", key), rows);
        assertThat(retried.getResponse().getStatus()).isEqualTo(201);
        assertThat(body(retried)).isEqualTo(body(imported));
        String otherDeckPath = owner.createDeck("Other deck");
        var changedRows = pasted(card("What is an archipelago?", "Many islands."));
        var elsewhere = owner.send(post(otherDeckPath + "/import").header("Idempotency-Key", key), rows);
        var changed = owner.send(post(deckPath + "/import").header("Idempotency-Key", key), changedRows);
        assertThat(List.of(elsewhere, changed)).allSatisfy(refused -> {
            assertThat(refused.getResponse().getStatus()).isEqualTo(409);
            assertThat(body(refused).get("reason").asString()).isEqualTo("CREATE_CONFLICT");
        });
        assertThat(store.countCards(owner.id)).isEqualTo(4);

        var events = StructuredEvents.named(output, "deck.cards_imported");
        assertThat(events).hasSize(1);
        assertThat(events.getFirst().at("/state/from").asLong()).isEqualTo(1);
        assertThat(events.getFirst().at("/state/to").asLong()).isEqualTo(4);
        assertThat(output.getOut()).doesNotContain(PRIVATE_TEXT);
    }

    @Test
    void overlappingConfirmationsOfOneImportCreateEachCardOnce(CapturedOutput output) throws Exception {
        var owner = new Browser();
        String deckPath = owner.createDeck("Overlap");
        String key = UUID.randomUUID().toString();
        var rows = pasted(card("First", "1"), card("Second", "2"));
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            Callable<MvcResult> confirm = () -> owner
                .send(post(deckPath + "/import").header("Idempotency-Key", key), rows);
            var results = workers.invokeAll(List.of(confirm, confirm));
            for (var result : results) {
                assertThat(result.get().getResponse().getStatus()).isEqualTo(201);
                assertThat(body(result.get()).get("importedCards").asInt()).isEqualTo(2);
            }
        }
        assertThat(store.countCards(owner.id)).isEqualTo(2);
        assertThat(StructuredEvents.named(output, "deck.cards_imported")).hasSize(1);
    }

    @Test
    void separateImportsRacingForTheLastFreeCardSaveOnlyOne() throws Exception {
        var owner = new Browser();
        String deckPath = owner.createDeck("Last slot");
        jdbc.update("""
            insert into cards(deck_id, position, question, answer, created_at, updated_at)
            select ?, number, 'Question', 'Answer', now(), now() from generate_series(1, ?) number
            """, deckId(deckPath), DeckService.MAX_CARDS_PER_LEARNER - 1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            Callable<Integer> confirm = () -> owner
                .send(post(deckPath + "/import").header("Idempotency-Key", UUID.randomUUID()), pasted(card("Q", "A")))
                .getResponse()
                .getStatus();
            var results = workers.invokeAll(List.of(confirm, confirm));
            assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(201, 409);
        }
        assertThat(store.countCards(owner.id)).isEqualTo(DeckService.MAX_CARDS_PER_LEARNER);
    }

    @Test
    void importsSaveNothingPastTheCardLimitAndAnExactRetryStillSucceedsAtTheLimit() throws Exception {
        var owner = new Browser();
        String deckPath = owner.createDeck("Nearly full");
        jdbc.update("""
            insert into cards(deck_id, position, question, answer, created_at, updated_at)
            select ?, number, 'Question', 'Answer', now(), now() from generate_series(1, ?) number
            """, deckId(deckPath), DeckService.MAX_CARDS_PER_LEARNER - 1);

        var tooMany = owner.send(
            post(deckPath + "/import").header("Idempotency-Key", UUID.randomUUID().toString()),
            pasted(card("One", "1"), card("Two", "2")));
        assertThat(tooMany.getResponse().getStatus()).isEqualTo(409);
        assertThat(body(tooMany).get("reason").asString()).isEqualTo("CARD_LIMIT");
        assertThat(body(tooMany).get("availableCards").asInt()).isEqualTo(1);
        assertThat(store.countCards(owner.id)).isEqualTo(DeckService.MAX_CARDS_PER_LEARNER - 1);

        String key = UUID.randomUUID().toString();
        var lastCard = pasted(card("Last", "Card"));
        var first = owner.send(post(deckPath + "/import").header("Idempotency-Key", key), lastCard);
        assertThat(first.getResponse().getStatus()).isEqualTo(201);
        var retried = owner.send(post(deckPath + "/import").header("Idempotency-Key", key), lastCard);
        assertThat(retried.getResponse().getStatus()).isEqualTo(201);
        assertThat(body(retried)).isEqualTo(body(first));
        var library = body(owner.send(get("/api/v1/decks"))).get("items");
        assertThat(library.get(0).get("cardCount").asLong()).isEqualTo(DeckService.MAX_CARDS_PER_LEARNER);
        var full = owner
            .send(post(deckPath + "/import").header("Idempotency-Key", UUID.randomUUID().toString()), lastCard);
        assertThat(body(full).get("availableCards").asInt()).isZero();
    }

    @Test
    void importsCheckEveryRowAndTheTwoHundredCardLimitBeforeSavingAny(CapturedOutput output) throws Exception {
        var owner = new Browser();
        String deckPath = owner.createDeck("Checked");
        var tooLong = card("Question", "a".repeat(CardText.MAX_ANSWER + 1));
        var refusedImports = List.of(
            Map.of("cards", List.of()),
            pasted(card("Question", "Answer"), card("No answer", "  ")),
            pasted(card("Question", "Answer"), tooLong),
            pasted(card("Null\0character", "Answer")),
            Map.of(
                "cards",
                java.util.stream.IntStream.rangeClosed(1, DeckService.MAX_CARDS_PER_IMPORT + 1)
                    .mapToObj(number -> card("Question " + number, "Answer"))
                    .toList()));
        for (var rows : refusedImports) {
            var refused = owner.send(post(deckPath + "/import").header("Idempotency-Key", UUID.randomUUID()), rows);
            assertThat(refused.getResponse().getStatus()).isEqualTo(422);
        }
        var withoutKey = owner.send(post(deckPath + "/import"), pasted(card("Question", "Answer")));
        assertThat(withoutKey.getResponse().getStatus()).isEqualTo(400);
        assertThat(store.countCards(owner.id)).isZero();
        assertThat(StructuredEvents.named(output, "deck.cards_imported")).isEmpty();

        var largest = Map.of(
            "cards",
            java.util.stream.IntStream.rangeClosed(1, DeckService.MAX_CARDS_PER_IMPORT)
                .mapToObj(number -> card("Question " + number, "Answer"))
                .toList());
        var accepted = owner.send(post(deckPath + "/import").header("Idempotency-Key", UUID.randomUUID()), largest);
        assertThat(body(accepted).get("importedCards").asInt()).isEqualTo(DeckService.MAX_CARDS_PER_IMPORT);
    }

    @Test
    void importsReachOnlyTheSignedInLearnersOwnDecks() throws Exception {
        var owner = new Browser();
        String deckPath = owner.createDeck("Owner's deck");
        var other = new Browser();
        String key = UUID.randomUUID().toString();
        var rows = pasted(card("Question", "Answer"));

        var intoOwnersDeck = other.send(post(deckPath + "/import").header("Idempotency-Key", key), rows);
        assertThat(intoOwnersDeck.getResponse().getStatus()).isEqualTo(404);
        assertThat(body(intoOwnersDeck).get("reason").asString()).isEqualTo("NOT_FOUND");
        var namingOwner = other.send(
            post(other.createDeck("Other's deck") + "/import").header("Idempotency-Key", key)
                .header("X-Revue-Learner", owner.username),
            rows);
        assertThat(namingOwner.getResponse().getStatus()).isEqualTo(403);
        assertThat(store.countCards(other.id)).isZero();

        var ownImport = owner.send(post(deckPath + "/import").header("Idempotency-Key", key), rows);
        assertThat(ownImport.getResponse().getStatus()).isEqualTo(201);
        assertThat(store.countCards(owner.id)).isEqualTo(1);
        var csrfless = post(deckPath + "/import").header("Idempotency-Key", UUID.randomUUID())
            .contentType("application/json")
            .content(json.writeValueAsString(rows))
            .cookie(owner.cookies.get("SESSION"));
        assertThat(mvc.perform(csrfless).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(store.countCards(owner.id)).isEqualTo(1);
    }

    @Test
    void importedCardsEnterTodayUnderTheAllowanceAndReturnOnTheirManilaDate() throws Exception {
        var owner = new Browser();
        String deckPath = owner.createDeck("Small deck");
        var imported = owner.send(
            post(deckPath + "/import").header("Idempotency-Key", UUID.randomUUID()),
            pasted(card("Imported 1", "Answer"), card("Imported 2", "Answer")));
        assertThat(imported.getResponse().getStatus()).isEqualTo(201);

        var queue = body(owner.send(get("/api/v1/cards/due")));
        assertThat(queue.get("newCards").asInt()).isEqualTo(2);
        long firstCard = queue.get("cards").get(0).get("id").asLong();
        assertThat(queue.get("cards").get(0).get("question").asString()).isEqualTo("Imported 1");
        var rated = owner.rate(firstCard, 0);
        assertThat(rated.getResponse().getStatus()).isEqualTo(200);
        LocalDate nextReview = LocalDate.parse(body(rated).get("nextReviewDate").asString());
        assertThat(nextReview).isAfter(LocalDate.of(2026, 11, 16));

        now.set(nextReview.atStartOfDay(java.time.ZoneId.of("Asia/Manila")).toInstant().minusSeconds(1));
        var dayBefore = body(owner.send(get("/api/v1/cards/due")));
        assertThat(dayBefore.get("dueCards").asInt()).isZero();
        now.set(nextReview.atStartOfDay(java.time.ZoneId.of("Asia/Manila")).toInstant());
        var onNextDate = body(owner.send(get("/api/v1/cards/due")));
        assertThat(onNextDate.get("dueCards").asInt()).isEqualTo(1);
        assertThat(onNextDate.get("cards").get(0).get("id").asLong()).isEqualTo(firstCard);
    }

    @Test
    void importedCardsWaitInTheDeckWhenTodaysNewCardAllowanceIsUsed() throws Exception {
        var owner = new Browser();
        String studiedPath = owner.createDeck("Studied today");
        for (int number = 1; number <= 10; number++) {
            owner.addRatedCard(studiedPath, "Studied " + number);
        }
        String deckPath = owner.createDeck("Imported later");
        owner.send(
            post(deckPath + "/import").header("Idempotency-Key", UUID.randomUUID()),
            pasted(card("Waiting", "Answer")));

        var today = body(owner.send(get("/api/v1/cards/due")));
        assertThat(today.get("newCards").asInt()).isZero();
        assertThat(today.get("cards").isEmpty()).isTrue();
        assertThat(body(owner.send(get(deckPath + "/cards"))).get("deck").get("cardCount").asLong()).isEqualTo(1);

        now.set(Instant.parse("2026-11-16T16:00:00Z"));
        assertThat(body(owner.send(get("/api/v1/cards/due"))).get("newCards").asInt()).isEqualTo(1);
    }

    @SafeVarargs
    private static Map<String, List<Map<String, String>>> pasted(Map<String, String>... cards) {
        return Map.of("cards", List.of(cards));
    }

    private static long deckId(String deckPath) {
        return Long.parseLong(deckPath.substring(deckPath.lastIndexOf('/') + 1));
    }

    private long rowsFor(String table, long cardId) {
        return jdbc.queryForObject("select count(*) from " + table + " where card_id = ?", Long.class, cardId);
    }

    private long sharedCard() {
        long set = jdbc.queryForObject("""
            insert into sets(set_key, title, description, publisher_name, subject, created_at, updated_at)
            values (?, 'Shared', '', 'Revue', 'History', now(), now()) returning id
            """, Long.class, UUID.randomUUID().toString());
        return jdbc.queryForObject("""
            insert into cards(set_id, content_key, position, question, answer, created_at, updated_at)
            values (?, ?, 0, 'Shared question', 'Answer', now(), now()) returning id
            """, Long.class, set, UUID.randomUUID().toString());
    }

    private static Map<String, String> card(String question, String answer) {
        return Map.of("question", question, "answer", answer);
    }

    private void assertPrivateCardHidden(MvcResult result) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(result.getResponse().getContentAsString()).doesNotContain(PRIVATE_TEXT);
        assertThat(body(result).has("card")).isFalse();
    }

    private JsonNode body(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString());
    }

    private final class Browser {
        private final Map<String, Cookie> cookies = new java.util.concurrent.ConcurrentHashMap<>();
        private final UUID id;
        private final String username;

        Browser() throws Exception {
            send(get("/api/v1/auth/csrf"));
            username = UUID.randomUUID().toString().replace("-", "");
            var result = send(
                post("/api/v1/auth/register").contentType("application/x-www-form-urlencoded")
                    .param("username", username)
                    .param("password", "kanjii"));
            assertThat(result.getResponse().getStatus()).isEqualTo(200);
            id = jdbc.queryForObject("select id from users where username = ?", UUID.class, username);
            send(get("/api/v1/auth/csrf"));
        }

        String createDeck(String title) throws Exception {
            var created = send(post("/api/v1/decks"), Map.of("title", title));
            assertThat(created.getResponse().getStatus()).isEqualTo(201);
            return "/api/v1/decks/" + body(created).get("id").asString();
        }

        long addRatedCard(String deckPath, String question) throws Exception {
            long cardId = body(send(post(deckPath + "/cards"), card(question, "Answer"))).get("id").asLong();
            send(get("/api/v1/cards/due"));
            assertThat(rate(cardId, 0).getResponse().getStatus()).isEqualTo(200);
            return cardId;
        }

        MvcResult rate(long cardId, int expectedVersion) throws Exception {
            return send(
                post("/api/v1/reviews/" + cardId),
                Map.of(
                    "rating",
                    "GOOD",
                    "attemptMode",
                    "ANSWERED",
                    "requestId",
                    UUID.randomUUID().toString(),
                    "expectedVersion",
                    expectedVersion,
                    "contentVersion",
                    1));
        }

        MvcResult send(MockHttpServletRequestBuilder request, Map<String, ?> jsonBody) throws Exception {
            return send(request.contentType("application/json").content(json.writeValueAsString(jsonBody)));
        }

        MvcResult send(MockHttpServletRequestBuilder request) throws Exception {
            if (!cookies.isEmpty()) {
                request.cookie(cookies.values().toArray(Cookie[]::new));
            }
            Cookie csrf = cookies.get("XSRF-TOKEN");
            if (csrf != null) {
                request.header("X-XSRF-TOKEN", csrf.getValue());
            }
            var result = mvc.perform(request).andReturn();
            for (Cookie cookie : result.getResponse().getCookies()) {
                if (cookie.getMaxAge() == 0) {
                    cookies.remove(cookie.getName());
                } else {
                    cookies.put(cookie.getName(), cookie);
                }
            }
            return result;
        }
    }
}
