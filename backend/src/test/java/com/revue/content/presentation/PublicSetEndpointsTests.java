package com.revue.content.presentation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.revue.TestcontainersConfiguration;
import com.revue.content.application.ContentLoader;
import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.SetDefinition;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The public set endpoints (plan sections 4 and 13), signed out, against PostgreSQL 18.6. Each test loads the content
 * it needs. A load is a complete source, so it also retires whatever an earlier test loaded.
 */
@SpringBootTest(properties = "revue.content.publish=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PublicSetEndpointsTests {

    private static final String PUBLIC_SETS = "/api/v1/public-sets";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ContentLoader loader;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void cursorsWithEmbeddedNullsInTheirTitlesAreBadInput() throws Exception {
        String cursor = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(("bad\0title\0" + "1").getBytes(StandardCharsets.UTF_8));
        mvc.perform(get(PUBLIC_SETS).param("after", cursor)).andExpect(status().isBadRequest());
    }

    @Test
    void publishedCatalogIncludesSubjectsAndLeavesPracticeSetsInThePublicList() throws Exception {
        loader.load(
            List.of(set("demo", "Demo", cards("demo-card")), set("published", "Published", cards("published-card"))));
        jdbc.update("update sets set save_allowed = true where set_key = 'published'");

        mvc.perform(get(PUBLIC_SETS).param("published", "true"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].setKey", contains("published")))
            .andExpect(jsonPath("$[0].subject").value("Science"));
        mvc.perform(get(PUBLIC_SETS + "/catalog/subjects"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].subject", contains("Science")))
            .andExpect(jsonPath("$[0].topicCount").value(1));
        mvc.perform(get(PUBLIC_SETS).param("published", "true").param("subject", "Science"))
            .andExpect(jsonPath("$[*].setKey", contains("published")));
        mvc.perform(get(PUBLIC_SETS).param("published", "true").param("subject", "History"))
            .andExpect(jsonPath("$").isEmpty());
        mvc.perform(get(PUBLIC_SETS)).andExpect(jsonPath("$[*].setKey", contains("demo", "published")));
    }

    @Test
    void topicSearchFiltersBeforePagingAndPreservesItsScopeInTheNextLink() throws Exception {
        loader.load(
            List.of(
                set("search-a", "Alpha", cards("search-card-a")),
                set("search-b", "B% & C", cards("search-card-b")),
                set("search-c", "D% & E", cards("search-card-c")),
                set("search-d", "F% & G", cards("search-card-d")),
                set("search-e", "H% & I", cards("search-card-e"))));
        jdbc.update("""
            update sets set save_allowed = true where set_key in ('search-a', 'search-b', 'search-c', 'search-d')
            """);
        jdbc.update("update sets set subject = 'Math' where set_key = 'search-d'");

        var first = mvc
            .perform(
                get(PUBLIC_SETS).param("published", "true")
                    .param("subject", "Science")
                    .param("q", " % & ")
                    .param("limit", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].setKey", contains("search-b")))
            .andReturn()
            .getResponse();
        String cursor = first.getHeader("X-Next-Cursor");
        assertThat(cursor).isNotBlank();
        assertThat(first.getHeader("Link")).contains("&published=true&subject=Science&q=%25+%26>");
        mvc.perform(
            get(PUBLIC_SETS).param("published", "true")
                .param("subject", "Science")
                .param("q", "% &")
                .param("limit", "1")
                .param("after", cursor))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].setKey", contains("search-c")))
            .andExpect(header().doesNotExist("X-Next-Cursor"));
        mvc.perform(get(PUBLIC_SETS).param("published", "true").param("subject", "Science").param("q", "b%"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].setKey", contains("search-b")));
    }

    @Test
    void theOnboardingListReturnsOnlyTheThreePracticeReviewers() throws Exception {
        loader.load(
            List.of(
                set("philippine-history", "Philippine History", cards("history-card")),
                set("philippine-nature", "Philippine Nature", cards("nature-card")),
                set("weather-and-disasters", "Weather & Disasters", cards("weather-card")),
                set("extra-practice", "Extra practice", cards("extra-card")),
                set("published-topic", "Published topic", cards("onboarding-excluded-card"))));
        jdbc.update("update sets set save_allowed = true where set_key = 'published-topic'");

        mvc.perform(get(PUBLIC_SETS + "/catalog/onboarding"))
            .andExpect(status().isOk())
            .andExpect(
                jsonPath("$[*].setKey", contains("philippine-history", "philippine-nature", "weather-and-disasters")));
    }

    @Test
    void pagesUseStableTitleAndIdOrderingAndBoundedCounts() throws Exception {
        loader.load(
            List.of(
                set("page-a", "Same", cards("page-a-card")),
                set("page-b", "Same", cards("page-b-card", "page-b-card-2")),
                set("page-c", "Zebra", cards("page-c-card"))));
        var first = mvc.perform(get(PUBLIC_SETS).param("limit", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].setKey").value("page-a"))
            .andExpect(jsonPath("$[0].cardCount").value(1))
            .andReturn()
            .getResponse();
        String cursor = first.getHeader("X-Next-Cursor");
        assertThat(cursor).isNotBlank();
        mvc.perform(get(PUBLIC_SETS).param("limit", "2").param("after", cursor))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].setKey", contains("page-b", "page-c")))
            .andExpect(jsonPath("$[0].cardCount").value(2))
            .andExpect(header().doesNotExist("X-Next-Cursor"));
        mvc.perform(get(PUBLIC_SETS).param("limit", "101")).andExpect(status().isBadRequest());
        mvc.perform(get(PUBLIC_SETS).param("after", "invalid")).andExpect(status().isBadRequest());
    }

    @Test
    void shortShareCodesResolveOnlyActiveSetsAndRemainStableAcrossContentUpdates() throws Exception {
        loader.load(
            List.of(set("share-history", "History", cards("share-a", "share-b", "share-c", "share-d", "share-e"))));
        Long id = jdbc.queryForObject("select id from sets where set_key = ?", Long.class, "share-history");
        String code = Long.toString(id, 36);
        mvc.perform(get(PUBLIC_SETS + "/share-history")).andExpect(jsonPath("$.shareCode").value(code));
        mvc.perform(get(PUBLIC_SETS + "/share/" + code + "/summary"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
            .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE))
            .andExpect(jsonPath("$.setKey").value("share-history"))
            .andExpect(jsonPath("$.sampleQuestion").value("Question share-a?"));
        loader.load(
            List.of(
                set("share-history", "Updated history", cards("share-a", "share-b", "share-c", "share-d", "share-e"))));
        mvc.perform(get(PUBLIC_SETS + "/share/" + code + "/summary"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Updated history"));
        loader.load(
            List.of(
                set(
                    "other",
                    "Other",
                    cards("other-share-a", "other-share-b", "other-share-c", "other-share-d", "other-share-e"))));
        mvc.perform(get(PUBLIC_SETS + "/share/" + code + "/summary")).andExpect(status().isNotFound());
        for (String invalid : List.of("0", "01", "-1", "ABC", "zzzzzzzzzzzzzz", "missing")) {
            mvc.perform(get(PUBLIC_SETS + "/share/" + invalid + "/summary")).andExpect(status().isNotFound());
        }
    }

    @Test
    void theListShowsEveryActiveSetInTitleOrderWithoutAnyAnswers() throws Exception {
        loader.load(
            List.of(
                set("weather", "Weather", cards("w-a", "w-b", "w-c", "w-d", "w-e")),
                set("history", "History", cards("h-a", "h-b", "h-c", "h-d", "h-e", "h-f")),
                set("short", "Almost Ready", cards("s-a", "s-b"))));

        mvc.perform(get(PUBLIC_SETS))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
            .andExpect(jsonPath("$[*].setKey").value(contains("short", "history", "weather")))
            .andExpect(jsonPath("$[*].cardCount").value(contains(2, 6, 5)))
            .andExpect(jsonPath("$[*].trialAvailable").value(contains(false, true, true)))
            .andExpect(jsonPath("$[*].saveAllowed").value(contains(false, false, false)))
            .andExpect(jsonPath("$[0].subject").value("Science"))
            .andExpect(jsonPath("$[0].*", hasSize(9)))
            .andExpect(jsonPath("$[1].title").value("History"))
            .andExpect(jsonPath("$[1].description").value("A set for tests."))
            .andExpect(jsonPath("$[1].publisherName").value("Revue"));
    }

    @Test
    void theRetiredSetDropsOutOfTheListAndItsPagesAnswer404() throws Exception {
        loader.load(
            List.of(
                set("history", "History", cards("h-a", "h-b", "h-c", "h-d", "h-e")),
                set("weather", "Weather", cards("w-a", "w-b", "w-c", "w-d", "w-e"))));
        loader.load(List.of(set("weather", "Weather", cards("w-a", "w-b", "w-c", "w-d", "w-e"))));

        mvc.perform(get(PUBLIC_SETS)).andExpect(jsonPath("$[*].setKey").value(contains("weather")));
        mvc.perform(get(PUBLIC_SETS + "/history"))
            .andExpect(status().isNotFound())
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
        mvc.perform(get(PUBLIC_SETS + "/history/demo-cards"))
            .andExpect(status().isNotFound())
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
    }

    @Test
    void anUnknownSetKeyAnswers404() throws Exception {
        loader.load(List.of(set("history", "History", cards("h-a", "h-b", "h-c", "h-d", "h-e"))));

        mvc.perform(get(PUBLIC_SETS + "/no-such-set")).andExpect(status().isNotFound());
        mvc.perform(get(PUBLIC_SETS + "/no-such-set/demo-cards")).andExpect(status().isNotFound());
    }

    @Test
    void oneSetsSummaryDescribesItWithoutAnyAnswers() throws Exception {
        loader.load(List.of(set("history", "History", cards("h-a", "h-b", "h-c", "h-d", "h-e", "h-f"))));

        mvc.perform(get(PUBLIC_SETS + "/history"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
            .andExpect(jsonPath("$.subject").value("Science"))
            .andExpect(jsonPath("$.*", hasSize(10)))
            .andExpect(jsonPath("$.setKey").value("history"))
            .andExpect(jsonPath("$.title").value("History"))
            .andExpect(jsonPath("$.sampleQuestion").value("Question h-a?"))
            .andExpect(jsonPath("$.cardCount").value(6))
            .andExpect(jsonPath("$.saveAllowed").value(false))
            .andExpect(jsonPath("$.trialAvailable").value(true));
    }

    @Test
    void theTrialGetsTheFirstFiveActiveCardsOfThatSetByPosition() throws Exception {
        loader.load(
            List.of(
                set("weather", "Weather", cards("w-a", "w-b", "w-c", "w-d", "w-e", "w-f")),
                set("history", "History", cards("a", "b", "c", "d", "e", "f", "g"))));
        // Card b is retired, and card g moves to the front. Without the filters, b or the other set's
        // cards would appear; ordered by row ID instead of position, g would come last.
        loader.load(
            List.of(
                set("weather", "Weather", cards("w-a", "w-b", "w-c", "w-d", "w-e", "w-f")),
                set("history", "History", cards("g", "a", "c", "d", "e", "f"))));

        mvc.perform(get(PUBLIC_SETS + "/history/demo-cards"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-cache, must-revalidate, private"))
            .andExpect(jsonPath("$.setTitle").value("History"))
            .andExpect(jsonPath("$.publisherName").value("Revue"))
            .andExpect(jsonPath("$.cards[*].key").value(contains("g", "a", "c", "d", "e")))
            .andExpect(jsonPath("$.cards[0].question").value("Question g?"))
            .andExpect(jsonPath("$.cards[0].answer").value("Answer g."))
            .andExpect(jsonPath("$.cards[0].explanation").value("Explanation g."))
            .andExpect(jsonPath("$.cards[0].source").value("Source g."))
            // The flashcard shows no memory hook, so the trial doesn't receive it.
            .andExpect(jsonPath("$.cards[0].memoryHook").doesNotExist());
        mvc.perform(get(PUBLIC_SETS + "/history")).andExpect(jsonPath("$.sampleQuestion").value("Question g?"));
        mvc.perform(get(PUBLIC_SETS)).andExpect(jsonPath("$[*].sampleQuestion").doesNotExist());
    }

    @Test
    void trialRevalidationSkipsUnchangedBodiesButStillChecksEditsAndRetirement() throws Exception {
        loader
            .load(List.of(set("conditional", "Conditional", cards("etag-a", "etag-b", "etag-c", "etag-d", "etag-e"))));
        String path = PUBLIC_SETS + "/conditional/demo-cards";
        var first = mvc.perform(get(path)).andExpect(status().isOk()).andReturn().getResponse();
        String tag = first.getHeader(HttpHeaders.ETAG);
        assertThat(tag).isNotBlank();
        var unchanged = mvc.perform(get(path).header(HttpHeaders.IF_NONE_MATCH, tag))
            .andExpect(status().isNotModified())
            .andReturn()
            .getResponse();
        assertThat(unchanged.getContentAsByteArray()).isEmpty();
        jdbc.update("update cards set answer = 'Changed answer' where content_key = 'etag-a'");
        var changed = mvc.perform(get(path).header(HttpHeaders.IF_NONE_MATCH, tag))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cards[0].answer").value("Changed answer"))
            .andReturn()
            .getResponse();
        assertThat(changed.getHeader(HttpHeaders.ETAG)).isNotEqualTo(tag);
        jdbc.update("update sets set retired_at = now() where set_key = 'conditional'");
        mvc.perform(get(path).header(HttpHeaders.IF_NONE_MATCH, changed.getHeader(HttpHeaders.ETAG)))
            .andExpect(status().isNotFound())
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
    }

    @Test
    void trialRevalidationAppliesOnlyToTheMediaTypeThatWasCached() throws Exception {
        loader.load(List.of(set("negotiated", "Negotiated", cards("type-a", "type-b", "type-c", "type-d", "type-e"))));
        String path = PUBLIC_SETS + "/negotiated/demo-cards";
        var json = mvc.perform(get(path).accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.VARY, "Accept"))
            .andReturn()
            .getResponse();
        String tag = json.getHeader(HttpHeaders.ETAG);

        mvc.perform(get(path).accept(MediaType.APPLICATION_JSON).header(HttpHeaders.IF_NONE_MATCH, tag))
            .andExpect(status().isNotModified());
        mvc.perform(get(path).accept(MediaType.TEXT_PLAIN).header(HttpHeaders.IF_NONE_MATCH, tag))
            .andExpect(status().isNotAcceptable());
        mvc.perform(get(path).accept("application/vnd.revue+json").header(HttpHeaders.IF_NONE_MATCH, tag))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("application/vnd.revue+json"));
    }

    @Test
    void theCardWithoutAnExplanationStillIncludesItsSource() throws Exception {
        List<CardDefinition> cards = new ArrayList<>(cards("p-a", "p-b", "p-c", "p-d"));
        cards.addFirst(
            new CardDefinition("p-plain", "A plain question?", "A plain answer.", null, null, "Class notes, page 1."));
        loader.load(List.of(set("plain", "Plain", cards)));

        mvc.perform(get(PUBLIC_SETS + "/plain/demo-cards"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cards[0].key").value("p-plain"))
            .andExpect(jsonPath("$.cards[0].explanation").value(nullValue()))
            .andExpect(jsonPath("$.cards[0].source").value("Class notes, page 1."));
    }

    @Test
    void withFourActiveCardsTheSetIsListedButItsTrialIsUnavailable() throws Exception {
        loader.load(List.of(set("history", "History", cards("a", "b", "c", "d"))));

        mvc.perform(get(PUBLIC_SETS + "/history"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cardCount").value(4))
            .andExpect(jsonPath("$.trialAvailable").value(false))
            .andExpect(jsonPath("$.sampleQuestion").doesNotExist());
        mvc.perform(get(PUBLIC_SETS + "/history/demo-cards"))
            .andExpect(status().isNotFound())
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
    }

    @Test
    void withExactlyFiveActiveCardsTheTrialIsAvailable() throws Exception {
        loader.load(List.of(set("history", "History", cards("a", "b", "c", "d", "e"))));

        mvc.perform(get(PUBLIC_SETS + "/history"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cardCount").value(5))
            .andExpect(jsonPath("$.trialAvailable").value(true));
        mvc.perform(get(PUBLIC_SETS + "/history/demo-cards"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cards[*].key").value(contains("a", "b", "c", "d", "e")));
    }

    @Test
    void signedOutVisitsCreateNoSession() throws Exception {
        loader.load(List.of(set("history", "History", cards("a", "b", "c", "d", "e"))));
        int sessionsBefore = countSessions();

        for (String path : new String[] {PUBLIC_SETS, PUBLIC_SETS + "/history", PUBLIC_SETS + "/history/demo-cards"}) {
            mvc.perform(get(path)).andExpect(status().isOk()).andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
        }

        assertThat(countSessions()).isEqualTo(sessionsBefore);
    }

    @Test
    void otherRoutesUnderPublicSetsStillNeedSignIn() throws Exception {
        mvc.perform(get(PUBLIC_SETS + "/history/answers")).andExpect(status().isUnauthorized());
    }

    private static SetDefinition set(String key, String title, List<CardDefinition> cards) {
        return new SetDefinition(key + ".yaml", key, title, "A set for tests.", "Revue", "Science", cards);
    }

    private static List<CardDefinition> cards(String... keys) {
        List<CardDefinition> cards = new ArrayList<>();
        for (String key : keys) {
            cards.add(
                new CardDefinition(
                    key,
                    "Question " + key + "?",
                    "Answer " + key + ".",
                    "Explanation " + key + ".",
                    "Hook " + key + ".",
                    "Source " + key + "."));
        }
        return cards;
    }

    private int countSessions() {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM spring_session", Integer.class);
        return count == null ? 0 : count;
    }
}
