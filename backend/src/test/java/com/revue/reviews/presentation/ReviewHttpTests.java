package com.revue.reviews.presentation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.revue.StructuredEvents;
import com.revue.TestcontainersConfiguration;
import com.revue.reviews.application.ReviewStore;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(properties = {"revue.content.publish=false", "REVUE_PILOT_INVITE_CODE=revtest1"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ExtendWith(OutputCaptureExtension.class)
class ReviewHttpTests {
    @Autowired
    MockMvc mvc;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ReviewStore store;
    @Autowired
    PlatformTransactionManager transactions;
    @MockitoBean
    Clock clock;
    private final JsonMapper json = JsonMapper.builder().build();
    private final AtomicReference<Instant> now = new AtomicReference<>();

    @BeforeEach
    void setTime() {
        now.set(Instant.parse("2026-11-13T12:00:00.123456789Z"));
        when(clock.instant()).thenAnswer(_ -> now.get());
    }

    @Test
    void ratingPersistsAndReplaysAfterRemovalWithoutLeakingAcrossAccounts(CapturedOutput output) throws Exception {
        var learner = new Browser();
        var other = new Browser();
        long set = publication(2);
        learner.save(set);
        other.save(set);
        JsonNode card = body(learner.send(get("/api/v1/cards/due"))).get("cards").get(0);
        long id = card.get("id").asLong();
        var input = rating("GOOD", 0);
        String first = learner.rate(id, input).getResponse().getContentAsString();
        assertThat(json.readTree(first).get("scheduleVersion").asLong()).isEqualTo(1);
        assertThat(json.readTree(first).get("nextReviewDate").asString()).isGreaterThan("2026-11-13");
        assertThat(learner.rate(id, input).getResponse().getContentAsString()).isEqualTo(first);
        assertThat(body(other.send(get("/api/v1/cards/due"))).get("newCards").asInt()).isEqualTo(2);
        assertThat(learner.rate(id, rating("GOOD", 0)).getResponse().getStatus()).isEqualTo(409);
        assertThat(learner.rate(id, rating("GOOD", 1)).getResponse().getStatus()).isEqualTo(409);
        learner.send(delete("/api/v1/sets/" + set + "/save"));
        jdbc.update("update cards set retired_at = now() where id = ?", id);
        assertThat(learner.rate(id, input).getResponse().getContentAsString()).isEqualTo(first);
        assertThat(other.rate(id, input).getResponse().getStatus()).isEqualTo(404);
        assertThat(body(learner.send(get("/api/v1/cards/due"))).get("cards").isEmpty()).isTrue();
        assertThat(StructuredEvents.named(output, "review.saved")).hasSize(1);
        assertThat(output.getAll()).doesNotContain("private-review-content-sentinel");
        assertThat(jdbc.queryForObject("select first_study_date from users where id = ?", LocalDate.class, learner.id))
            .isEqualTo(LocalDate.of(2026, 11, 13));
    }

    @Test
    void duplicateAndCompetingRatingsHaveOneWinner() throws Exception {
        var learner = new Browser();
        long set = publication(2);
        learner.save(set);
        var cards = body(learner.send(get("/api/v1/cards/due"))).get("cards");
        long first = cards.get(0).get("id").asLong();
        var input = rating("AGAIN", 0);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var duplicates = workers.invokeAll(
                List.<Callable<MvcResult>>of(() -> learner.rate(first, input), () -> learner.rate(first, input)));
            assertThat(duplicates.get(0).get().getResponse().getStatus()).isEqualTo(200);
            assertThat(duplicates.get(0).get().getResponse().getContentAsString())
                .isEqualTo(duplicates.get(1).get().getResponse().getContentAsString());
            long second = cards.get(1).get("id").asLong();
            var competitors = workers.invokeAll(
                List.<Callable<Integer>>of(
                    () -> learner.rate(second, rating("HARD", 0)).getResponse().getStatus(),
                    () -> learner.rate(second, rating("EASY", 0)).getResponse().getStatus()));
            assertThat(List.of(competitors.get(0).get(), competitors.get(1).get())).containsExactlyInAnyOrder(200, 409);
        }
        assertThat(jdbc.queryForObject("select count(*) from review_logs where user_id = ?", Integer.class, learner.id))
            .isEqualTo(2);
        assertThat(jdbc.queryForObject("select sum(version) from schedules where user_id = ?", Long.class, learner.id))
            .isEqualTo(2);
    }

    @Test
    void lastDailySlotIsSerializedAndRemovalNeverRefundsIt() throws Exception {
        var learner = new Browser();
        long set = publication(11);
        learner.save(set);
        var ids = jdbc.queryForList("select id from cards where set_id = ? order by id", Long.class, set);
        for (int i = 0; i < 9; i++) {
            assertThat(learner.rate(ids.get(i), rating("GOOD", 0)).getResponse().getStatus()).isEqualTo(200);
        }
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var results = workers.invokeAll(
                List.<Callable<Integer>>of(
                    () -> learner.rate(ids.get(9), rating("GOOD", 0)).getResponse().getStatus(),
                    () -> learner.rate(ids.get(10), rating("GOOD", 0)).getResponse().getStatus()));
            assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(200, 409);
        }
        var queue = body(learner.send(get("/api/v1/cards/due")));
        assertThat(queue.get("cards").isEmpty()).isTrue();
        assertThat(queue.get("nextReviewDate").asString()).isEqualTo("2026-11-14");
        learner.send(delete("/api/v1/sets/" + set + "/save"));
        long replacement = publication(1);
        learner.save(replacement);
        assertThat(body(learner.send(get("/api/v1/cards/due"))).get("newCards").asInt()).isZero();
        learner.save(set);
        assertThat(jdbc.queryForObject("select sum(version) from schedules where user_id = ?", Long.class, learner.id))
            .isEqualTo(10);
    }

    @Test
    void queueInitializesNewCardsAndRetiredSetsKeepActiveCards() throws Exception {
        var learner = new Browser();
        long set = publication(2);
        learner.save(set);
        addCard(set, 2);
        jdbc.update("update sets set retired_at = now(), save_allowed = false where id = ?", set);
        var queue = body(learner.send(get("/api/v1/cards/due")));
        assertThat(queue.get("newCards").asInt()).isEqualTo(3);
        learner.send(get("/api/v1/cards/due"));
        assertThat(jdbc.queryForObject("select count(*) from schedules where user_id = ?", Integer.class, learner.id))
            .isEqualTo(3);
        long card = queue.get("cards").get(0).get("id").asLong();
        assertThat(learner.rate(card, rating("GOOD", 0)).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void queueOrdersOverdueBeforeDueBeforeNewAndBoundsTheBatch() throws Exception {
        var learner = new Browser();
        long set = publication(8);
        learner.save(set);
        List<Long> ids = jdbc.queryForList("select id from cards where set_id = ? order by position", Long.class, set);
        assertThat(learner.rate(ids.get(6), rating("GOOD", 0)).getResponse().getStatus()).isEqualTo(200);
        assertThat(learner.rate(ids.get(7), rating("GOOD", 0)).getResponse().getStatus()).isEqualTo(200);
        LocalDate today = now.get().atZone(java.time.ZoneId.of("Asia/Manila")).toLocalDate();
        jdbc.update(
            "update schedules set next_review_date = ? where user_id = ? and card_id = ?",
            today,
            learner.id,
            ids.get(6));
        jdbc.update(
            "update schedules set next_review_date = ? where user_id = ? and card_id = ?",
            today.minusDays(2),
            learner.id,
            ids.get(7));
        var queue = body(learner.send(get("/api/v1/cards/due")));
        assertThat(queue.get("cards").valueStream().map(card -> card.get("id").asLong()).toList())
            .containsExactly(ids.get(7), ids.get(6), ids.get(0), ids.get(1), ids.get(2));
        assertThat(queue.get("dueCards").asInt()).isEqualTo(2);
        assertThat(queue.get("newCards").asInt()).isEqualTo(6);
        assertThat(body(learner.send(get("/api/v1/cards/due?limit=1"))).get("cards").size()).isEqualTo(1);
        for (int limit : List.of(0, 6)) {
            var rejected = learner.send(get("/api/v1/cards/due?limit=" + limit));
            assertThat(rejected.getResponse().getStatus()).isEqualTo(422);
            assertThat(body(rejected).get("reason").asString()).isEqualTo("INVALID_LIMIT");
        }
        jdbc.update("update cards set retired_at = now() where set_id = ?", set);
        var unavailable = body(learner.send(get("/api/v1/cards/due")));
        assertThat(unavailable.get("totalCards").asInt()).isEqualTo(8);
        assertThat(unavailable.get("availableCards").asInt()).isZero();
        assertThat(unavailable.get("nextReviewDate").isNull()).isTrue();
        assertThat(learner.rate(ids.get(0), rating("GOOD", 0)).getResponse().getStatus()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from review_logs where user_id = ?", Integer.class, learner.id))
            .isEqualTo(2);
    }

    @Test
    void validationAndAccessNeverWriteAndChangedTextKeepsDisplayedVersion() throws Exception {
        var learner = new Browser();
        long set = publication(1);
        long card = jdbc.queryForObject("select id from cards where set_id = ?", Long.class, set);
        assertThat(learner.rate(card, rating("GOOD", 0)).getResponse().getStatus()).isEqualTo(404);
        learner.save(set);
        var shown = new ReviewStore.Rating("GOOD", "SHOWN", UUID.randomUUID(), 0, 1);
        assertThat(learner.rate(card, shown).getResponse().getStatus()).isEqualTo(422);
        assertThat(
            mvc.perform(
                post("/api/v1/reviews/" + card).contentType("application/json")
                    .content(json.writeValueAsString(rating("GOOD", 0))))
                .andReturn()
                .getResponse()
                .getStatus())
            .isEqualTo(403);
        assertThat(mvc.perform(get("/api/v1/cards/due")).andReturn().getResponse().getStatus()).isEqualTo(401);
        jdbc.update("update cards set content_version = 2 where id = ?", card);
        var input = rating("GOOD", 0);
        assertThat(learner.rate(card, input).getResponse().getStatus()).isEqualTo(200);
        assertThat(
            jdbc.queryForObject(
                "select reviewed_content_version from review_logs where user_id = ?",
                Integer.class,
                learner.id))
            .isEqualTo(1);
        var changed = new ReviewStore.Rating("EASY", "ANSWERED", input.requestId(), 0, 1);
        assertThat(body(learner.rate(card, changed)).get("reason").asString()).isEqualTo("REQUEST_REUSED");
    }

    @Test
    void duplicateInsertLeavesTransactionUsableAndExistingResultUnchanged() throws Exception {
        var learner = new Browser();
        long set = publication(1);
        learner.save(set);
        long card = jdbc.queryForObject("select id from cards where set_id = ?", Long.class, set);
        var input = rating("GOOD", 0);
        learner.rate(card, input);
        new TransactionTemplate(transactions).executeWithoutResult(_ -> {
            var original = store.logged(learner.id, input.requestId()).orElseThrow();
            assertThat(
                store.insert(
                    learner.id,
                    input,
                    original.result(),
                    LocalDate.of(2026, 11, 13),
                    "fsrs6-java1.0.0-daily-v1"))
                .isFalse();
            assertThat(store.logged(learner.id, input.requestId()).orElseThrow()).isEqualTo(original);
        });
    }

    @Test
    void savedEventWaitsForCommitAndIsDiscardedOnRollback(CapturedOutput output) throws Exception {
        var learner = new Browser();
        long set = publication(1);
        learner.save(set);
        long card = jdbc.queryForObject("select id from cards where set_id = ?", Long.class, set);
        var input = rating("GOOD", 0);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            try {
                assertThat(learner.rate(card, input).getResponse().getStatus()).isEqualTo(200);
            } catch (Exception failure) {
                throw new IllegalStateException(failure);
            }
            assertThat(store.logged(learner.id, input.requestId())).isPresent();
            assertThat(StructuredEvents.named(output, "review.saved")).isEmpty();
            status.setRollbackOnly();
        });
        assertUnchanged(learner.id);
        assertThat(StructuredEvents.named(output, "review.saved")).isEmpty();
        assertThat(learner.rate(card, input).getResponse().getStatus()).isEqualTo(200);
        assertThat(StructuredEvents.named(output, "review.saved")).hasSize(1);
    }

    @Test
    void conditionalMissRollsBackLogAndStudyDates(CapturedOutput output) throws Exception {
        var learner = new Browser();
        long set = publication(1);
        learner.save(set);
        long card = jdbc.queryForObject("select id from cards where set_id = ?", Long.class, set);
        jdbc.execute(
            "create function reject_review_update() returns trigger language plpgsql as $$ begin return null; end $$");
        jdbc.execute("""
            create trigger reject_review_update before update on schedules
            for each row execute function reject_review_update()
            """);
        try {
            assertThat(learner.rate(card, rating("GOOD", 0)).getResponse().getStatus()).isEqualTo(409);
            assertUnchanged(learner.id);
            assertThat(StructuredEvents.named(output, "review.saved")).isEmpty();
        } finally {
            jdbc.execute("drop trigger reject_review_update on schedules");
            jdbc.execute("drop function reject_review_update()");
        }
    }

    @Test
    void laterStudyDateFailureRollsBackScheduleAndLog(CapturedOutput output) throws Exception {
        var learner = new Browser();
        long set = publication(1);
        learner.save(set);
        long card = jdbc.queryForObject("select id from cards where set_id = ?", Long.class, set);
        jdbc.execute("""
            create function reject_study_date() returns trigger language plpgsql
            as $$ begin raise exception 'test rollback'; end $$
            """);
        jdbc.execute("""
            create trigger reject_study_date before update of first_study_date on users
            for each row execute function reject_study_date()
            """);
        try {
            assertThatThrownBy(() -> learner.rate(card, rating("GOOD", 0)))
                .hasRootCauseInstanceOf(org.postgresql.util.PSQLException.class);
            assertUnchanged(learner.id);
            assertThat(StructuredEvents.named(output, "review.saved")).isEmpty();
        } finally {
            jdbc.execute("drop trigger reject_study_date on users");
            jdbc.execute("drop function reject_study_date()");
        }
    }

    @Test
    void reloadedStateAdvancesOnLaterManilaDayAndKeepsStudyDates() throws Exception {
        var learner = new Browser();
        long set = publication(1);
        learner.save(set);
        long card = jdbc.queryForObject("select id from cards where set_id = ?", Long.class, set);
        var first = body(learner.rate(card, rating("AGAIN", 0)));
        LocalDate due = LocalDate.parse(first.get("nextReviewDate").asString());
        now.set(due.atStartOfDay(java.time.ZoneId.of("Asia/Manila")).toInstant());
        assertThat(body(learner.send(get("/api/v1/cards/due"))).get("dueCards").asInt()).isEqualTo(1);
        assertThat(learner.rate(card, rating("GOOD", 1)).getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select second_study_date from users where id = ?", LocalDate.class, learner.id))
            .isEqualTo(due);
        assertThat(jdbc.queryForObject("select version from schedules where user_id = ?", Long.class, learner.id))
            .isEqualTo(2);
    }

    @Test
    void waitingReviewUsesTimeAfterLockAndRechecksCredentials() throws Exception {
        for (boolean revoke : List.of(false, true)) {
            var learner = new Browser();
            long set = publication(1);
            learner.save(set);
            long card = jdbc.queryForObject("select id from cards where set_id = ?", Long.class, set);
            now.set(Instant.parse("2026-11-13T15:59:59Z"));
            try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
                var pending = new AtomicReference<java.util.concurrent.Future<MvcResult>>();
                new TransactionTemplate(transactions).executeWithoutResult(_ -> {
                    jdbc.queryForObject("select id from users where id = ? for no key update", UUID.class, learner.id);
                    pending.set(workers.submit(() -> learner.rate(card, rating("AGAIN", 0))));
                    org.awaitility.Awaitility.await()
                        .atMost(java.time.Duration.ofSeconds(5))
                        .until(() -> jdbc.queryForObject("""
                            select count(*) from pg_stat_activity
                            where datname = current_database() and wait_event_type = 'Lock'
                            and query like '%users%' and pid <> pg_backend_pid()
                            """, Integer.class) > 0);
                    now.set(Instant.parse("2026-11-13T16:00:01Z"));
                    if (revoke) {
                        jdbc.update(
                            "update users set credential_version = credential_version + 1 where id = ?",
                            learner.id);
                    }
                });
                var result = pending.get().get(5, java.util.concurrent.TimeUnit.SECONDS);
                assertThat(result.getResponse().getStatus()).isEqualTo(revoke ? 401 : 200);
                if (revoke) {
                    assertUnchanged(learner.id);
                } else {
                    assertThat(body(result).get("reviewedAt").asString()).isEqualTo("2026-11-13T16:00:01Z");
                    assertThat(body(result).get("nextReviewDate").asString()).isGreaterThan("2026-11-14");
                    assertThat(
                        jdbc.queryForObject(
                            "select first_study_date from users where id = ?",
                            LocalDate.class,
                            learner.id))
                        .isEqualTo(LocalDate.of(2026, 11, 14));
                }
            }
        }
    }

    private void assertUnchanged(UUID learner) {
        assertThat(jdbc.queryForObject("select count(*) from review_logs where user_id = ?", Integer.class, learner))
            .isZero();
        assertThat(jdbc.queryForObject("select sum(version) from schedules where user_id = ?", Long.class, learner))
            .isZero();
        assertThat(jdbc.queryForObject("select first_study_date from users where id = ?", LocalDate.class, learner))
            .isNull();
    }

    private ReviewStore.Rating rating(String value, long version) {
        return new ReviewStore.Rating(value, "ANSWERED", UUID.randomUUID(), version, 1);
    }

    private long publication(int cards) {
        long id = jdbc.queryForObject("""
            insert into sets(set_key,title,description,publisher_name,subject,save_allowed,created_at,updated_at)
            values (?, 'Study test', '', 'Revue', 'History', true, now(), now()) returning id
            """, Long.class, UUID.randomUUID().toString());
        for (int i = 0; i < cards; i++) {
            addCard(id, i);
        }
        return id;
    }

    private void addCard(long set, int position) {
        jdbc.update(
            """
                insert into cards(set_id,content_key,position,question,answer,explanation,source,key_ideas,created_at,updated_at)
                values (?,?,?,'private-review-content-sentinel','Answer','','https://example.com',array['Answer'],now(),now())
                """,
            set,
            UUID.randomUUID().toString(),
            position);
    }

    private JsonNode body(MvcResult result) throws Exception {
        assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store");
        return json.readTree(result.getResponse().getContentAsString());
    }

    private final class Browser {
        private final Map<String, Cookie> cookies = new java.util.concurrent.ConcurrentHashMap<>();
        private final UUID id;

        Browser() throws Exception {
            send(get("/api/v1/auth/csrf"));
            String username = UUID.randomUUID().toString().replace("-", "");
            var result = send(
                post("/api/v1/auth/register").contentType("application/x-www-form-urlencoded")
                    .param("username", username)
                    .param("password", "kanjii")
                    .param("invitation", "revtest1"));
            assertThat(result.getResponse().getStatus()).isEqualTo(200);
            id = jdbc.queryForObject("select id from users where username = ?", UUID.class, username);
            send(get("/api/v1/auth/csrf"));
        }

        void save(long set) throws Exception {
            assertThat(send(post("/api/v1/sets/" + set + "/save")).getResponse().getStatus()).isEqualTo(200);
        }

        MvcResult rate(long card, ReviewStore.Rating input) throws Exception {
            return send(
                post("/api/v1/reviews/" + card).contentType("application/json")
                    .content(json.writeValueAsString(input)));
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
