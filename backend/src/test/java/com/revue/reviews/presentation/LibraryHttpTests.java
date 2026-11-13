package com.revue.reviews.presentation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.revue.StructuredEvents;
import com.revue.TestcontainersConfiguration;
import com.revue.reviews.application.LibraryStore;
import com.revue.reviews.domain.DailyReviewScheduler;
import com.revue.reviews.domain.MemoryModel;
import com.revue.reviews.domain.ReviewRating;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(properties = {"revue.content.publish=false", "REVUE_PILOT_INVITE_CODE=libtest1"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ExtendWith(OutputCaptureExtension.class)
class LibraryHttpTests {
    @Autowired
    MockMvc mvc;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    LibraryStore store;
    @Autowired
    MemoryModel memory;
    @Autowired
    PlatformTransactionManager transactions;
    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void savesOnceWithIndependentSchedulesAndPreservesProgress(CapturedOutput output) throws Exception {
        var first = new Browser();
        var second = new Browser();
        long set = publication();
        first.register();
        second.register();
        var saved = first.send(post(path(set)));
        assertThat(saved.getResponse().getStatus()).isEqualTo(200);
        assertThat(saved.getResponse().getHeader("Cache-Control")).contains("no-store", "private");
        assertThat(body(saved).get("cardCount").asLong()).isEqualTo(2);
        assertThat(first.send(post(path(set))).getResponse().getContentAsString())
            .isEqualTo(saved.getResponse().getContentAsString());
        assertThat(body(second.send(get(path(set)))).get("saved").asBoolean()).isFalse();
        assertThat(body(second.send(get("/api/v1/me/saved-sets"))).get("items").size()).isZero();
        assertThat(second.send(post(path(set))).getResponse().getStatus()).isEqualTo(200);
        assertThat(
            jdbc.queryForObject(
                "select count(*) from schedules where user_id in (?, ?)",
                Integer.class,
                first.id,
                second.id))
            .isEqualTo(4);
        assertThat(jdbc.queryForObject("""
            select count(*) from schedules where user_id = ? and version = 0
            and last_reviewed_at is null and next_review_date is null and scheduler_id = ?
            """, Integer.class, first.id, DailyReviewScheduler.PROFILE)).isEqualTo(2);
        jdbc.update("""
            update schedules set version = 1, last_reviewed_at = now(), last_reviewed_content_version = 1,
                next_review_date = current_date + 7, recommended_review_date = current_date + 7
            where user_id = ?
            """, first.id);
        first.send(post(path(set)));
        assertThat(jdbc.queryForObject("select min(version) from schedules where user_id = ?", Long.class, first.id))
            .isEqualTo(1);
        assertThat(jdbc.queryForObject("select max(version) from schedules where user_id = ?", Long.class, second.id))
            .isZero();
        assertThat(StructuredEvents.named(output, "library.set_saved")).hasSize(2);
        assertThat(output.getAll()).doesNotContain("private-content-sentinel");
    }

    @Test
    void removalAndResavingPreserveAllProgressAndOtherLearners(CapturedOutput output) throws Exception {
        var first = new Browser();
        var second = new Browser();
        first.register();
        second.register();
        long set = publication();
        first.send(post(path(set)));
        second.send(post(path(set)));
        var prediction = memory.firstReview(1, ReviewRating.GOOD, Instant.parse("2026-11-13T00:00:00Z"));
        jdbc.update("""
            update schedules set scheduler_state = cast(? as jsonb), version = 1,
                last_reviewed_at = now(), last_reviewed_content_version = 1,
                recommended_review_date = current_date + 7, next_review_date = current_date + 7
            where user_id = ?
            """, prediction.stateJson(), first.id);
        var before = jdbc.queryForList("select * from schedules where user_id = ? order by card_id", first.id);
        var other = jdbc.queryForList("select * from schedules where user_id = ? order by card_id", second.id);
        var removed = first.send(delete(path(set)));
        assertThat(removed.getResponse().getStatus()).isEqualTo(204);
        assertThat(removed.getResponse().getHeader("Cache-Control")).contains("no-store", "private");
        assertThat(body(first.send(get(path(set)))).get("saved").asBoolean()).isFalse();
        assertThat(body(first.send(get("/api/v1/me/saved-sets"))).get("items").isEmpty()).isTrue();
        assertThat(first.send(delete(path(set))).getResponse().getStatus()).isEqualTo(204);
        assertThat(first.send(delete(path(Long.MAX_VALUE))).getResponse().getStatus()).isEqualTo(204);
        assertThat(jdbc.queryForList("select * from schedules where user_id = ? order by card_id", first.id))
            .isEqualTo(before);
        assertThat(first.send(post(path(set))).getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbc.queryForList("select * from schedules where user_id = ? order by card_id", first.id))
            .isEqualTo(before);
        assertThat(body(second.send(get(path(set)))).get("saved").asBoolean()).isTrue();
        assertThat(jdbc.queryForList("select * from schedules where user_id = ? order by card_id", second.id))
            .isEqualTo(other);
        assertThat(StructuredEvents.named(output, "library.set_removed")).hasSize(1);
        var event = StructuredEvents.named(output, "library.set_removed").getFirst();
        assertThat(event.at("/event/outcome").asString()).isEqualTo("success");
        assertThat(event.at("/actor/id").asString()).isEqualTo(first.id.toString());
        assertThat(event.at("/state/from").asString()).isEqualTo("saved");
        assertThat(event.at("/state/to").asString()).isEqualTo("absent");
        assertThat(event.at("/operation/id").asString()).isNotBlank();
        assertThat(output.getAll()).doesNotContain("private-content-sentinel");
    }

    @Test
    void concurrentRemovalsChangeMembershipOnceAndKeepSchedules(CapturedOutput output) throws Exception {
        var browser = new Browser();
        browser.register();
        long set = publication();
        browser.send(post(path(set)));
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks = IntStream.range(0, 4)
                .mapToObj(_ -> (Callable<Integer>) () -> browser.send(delete(path(set))).getResponse().getStatus())
                .toList();
            for (var result : workers.invokeAll(tasks)) {
                assertThat(result.get()).isEqualTo(204);
            }
        }
        assertThat(body(browser.send(get(path(set)))).get("saved").asBoolean()).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from schedules where user_id = ?", Integer.class, browser.id))
            .isEqualTo(2);
        assertThat(StructuredEvents.named(output, "library.set_removed")).hasSize(1);
    }

    @Test
    void rolledBackRemovalKeepsMembershipAndEmitsNoSuccess(CapturedOutput output) throws Exception {
        var browser = new Browser();
        browser.register();
        long set = publication();
        browser.send(post(path(set)));
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            store.remove(browser.id, set);
            assertThat(store.contains(browser.id, set)).isFalse();
            assertThat(StructuredEvents.named(output, "library.set_removed")).isEmpty();
            status.setRollbackOnly();
        });
        assertThat(body(browser.send(get(path(set)))).get("saved").asBoolean()).isTrue();
        assertThat(StructuredEvents.named(output, "library.set_removed")).isEmpty();
    }

    @Test
    void concurrentSavesCommitOneMembershipAndOneSchedulePerActiveCard(CapturedOutput output) throws Exception {
        var browser = new Browser();
        browser.register();
        long set = publication();
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks = IntStream.range(0, 8)
                .mapToObj(_ -> (Callable<Integer>) () -> browser.send(post(path(set))).getResponse().getStatus())
                .toList();
            for (var result : workers.invokeAll(tasks)) {
                assertThat(result.get()).isEqualTo(200);
            }
        }
        assertThat(jdbc.queryForObject("select count(*) from saved_sets where user_id = ?", Integer.class, browser.id))
            .isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from schedules where user_id = ?", Integer.class, browser.id))
            .isEqualTo(2);
        assertThat(StructuredEvents.named(output, "library.set_saved")).hasSize(1);
    }

    @Test
    void rollbackLeavesNeitherMembershipSchedulesNorSuccessEvent(CapturedOutput output) throws Exception {
        var browser = new Browser();
        browser.register();
        long set = publication();
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            store.save(browser.id, set, DailyReviewScheduler.PROFILE, memory.initialState());
            assertThat(StructuredEvents.named(output, "library.set_saved")).isEmpty();
            status.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("select count(*) from saved_sets where user_id = ?", Integer.class, browser.id))
            .isZero();
        assertThat(jdbc.queryForObject("select count(*) from schedules where user_id = ?", Integer.class, browser.id))
            .isZero();
        assertThat(StructuredEvents.named(output, "library.set_saved")).isEmpty();
    }

    @Test
    void retiredSetsStayInTheLibraryButCannotBeSavedAndPagingIsBounded() throws Exception {
        var browser = new Browser();
        browser.register();
        long first = publication();
        long second = publication();
        browser.send(post(path(first)));
        browser.send(post(path(second)));
        jdbc.update("update sets set retired_at = now() where id = ?", first);
        assertThat(browser.send(post(path(first))).getResponse().getStatus()).isEqualTo(404);
        assertThat(browser.send(post(path(Long.MAX_VALUE))).getResponse().getStatus()).isEqualTo(404);
        var page = body(browser.send(get("/api/v1/me/saved-sets?limit=1")));
        assertThat(page.get("items").size()).isEqualTo(1);
        assertThat(page.get("items").get(0).get("retired").asBoolean()).isTrue();
        var next = body(browser.send(get("/api/v1/me/saved-sets?limit=1&after=" + page.get("nextCursor").asString())));
        assertThat(next.get("items").get(0).get("id").asString()).isEqualTo(Long.toString(second));
        assertThat(next.get("nextCursor").isNull()).isTrue();
        assertThat(browser.send(get("/api/v1/me/saved-sets?limit=101")).getResponse().getStatus()).isEqualTo(400);
        assertThat(browser.send(get("/api/v1/me/saved-sets?after=-1")).getResponse().getStatus()).isEqualTo(400);
        assertThat(browser.send(get("/api/v1/me/saved-sets?after=invalid")).getResponse().getStatus()).isEqualTo(400);
        assertThat(browser.send(delete(path(first))).getResponse().getStatus()).isEqualTo(204);
        assertThat(body(browser.send(get(path(first)))).get("saved").asBoolean()).isFalse();
        assertThat(browser.send(post(path(first))).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void authenticationCsrfAndCurrentEligibilityProtectEveryPrivateOperation() throws Exception {
        long set = publication();
        assertThat(mvc.perform(get(path(set))).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(get("/api/v1/me/saved-sets")).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(post(path(set))).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(mvc.perform(delete(path(set))).andReturn().getResponse().getStatus()).isEqualTo(403);
        var browser = new Browser();
        browser.register();
        assertThat(
            mvc.perform(post(path(set)).cookie(browser.cookies.get("SESSION"))).andReturn().getResponse().getStatus())
            .isEqualTo(403);
        assertThat(
            mvc.perform(delete(path(set)).cookie(browser.cookies.get("SESSION"))).andReturn().getResponse().getStatus())
            .isEqualTo(403);
        jdbc.update("update users set credential_version = credential_version + 1 where id = ?", browser.id);
        assertThat(browser.send(post(path(set))).getResponse().getStatus()).isEqualTo(401);
        browser.send(get("/api/v1/auth/csrf"));
        assertThat(browser.send(delete(path(set))).getResponse().getStatus()).isEqualTo(401);
        assertThat(jdbc.queryForObject("select count(*) from saved_sets where user_id = ?", Integer.class, browser.id))
            .isZero();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void waitingMembershipChangeRechecksCredentialsAfterAcquiringTheLearnerLock(boolean removing) throws Exception {
        var browser = new Browser();
        browser.register();
        long set = publication();
        if (removing) {
            browser.send(post(path(set)));
        }
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<Integer>>();
            new TransactionTemplate(transactions).executeWithoutResult(_ -> {
                jdbc.queryForObject("select id from users where id = ? for update", UUID.class, browser.id);
                pending.set(
                    workers.submit(
                        () -> browser.send(removing ? delete(path(set)) : post(path(set))).getResponse().getStatus()));
                // Wait for the actual database lock, not an arbitrary scheduling delay.
                org.awaitility.Awaitility.await()
                    .atMost(java.time.Duration.ofSeconds(5))
                    .until(() -> jdbc.queryForObject("""
                        select count(*) from pg_stat_activity
                        where datname = current_database() and wait_event_type = 'Lock'
                        and query like '%users%' and pid <> pg_backend_pid()
                        """, Integer.class) > 0);
                jdbc.update("update users set credential_version = credential_version + 1 where id = ?", browser.id);
            });
            assertThat(pending.get().get(5, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(401);
        }
        assertThat(jdbc.queryForObject("select count(*) from saved_sets where user_id = ?", Integer.class, browser.id))
            .isEqualTo(removing ? 1 : 0);
    }

    @Test
    void practiceOnlySetsRejectNewSavesButKeepExistingMembershipAndProgress() throws Exception {
        var browser = new Browser();
        browser.register();
        long set = publication();
        assertThat(browser.send(post(path(set))).getResponse().getStatus()).isEqualTo(200);
        final var before = jdbc.queryForList("select * from schedules where user_id = ? order by card_id", browser.id);
        jdbc.update("update sets set save_allowed = false where id = ?", set);

        var saved = body(browser.send(get("/api/v1/me/saved-sets"))).get("items").get(0);
        assertThat(saved.get("saveAllowed").asBoolean()).isFalse();
        assertThat(browser.send(post(path(set))).getResponse().getStatus()).isEqualTo(404);
        assertThat(browser.send(delete(path(set))).getResponse().getStatus()).isEqualTo(204);
        assertThat(browser.send(post(path(set))).getResponse().getStatus()).isEqualTo(404);
        assertThat(body(browser.send(get(path(set)))).get("saved").asBoolean()).isFalse();
        assertThat(jdbc.queryForList("select * from schedules where user_id = ? order by card_id", browser.id))
            .isEqualTo(before);
    }

    private long publication() {
        long id = jdbc.queryForObject("""
            insert into sets(set_key,title,description,publisher_name,subject,save_allowed,created_at,updated_at)
            values (?, 'A shared set', 'private-content-sentinel', 'Revue', 'History', true, now(), now()) returning id
            """, Long.class, UUID.randomUUID().toString());
        for (int i = 0; i < 3; i++) {
            jdbc.update(
                """
                    insert into cards(set_id,content_key,position,question,answer,explanation,source,key_ideas,retired_at,created_at,updated_at)
                    values (?,?,?,'Question','Answer','','','{}',case when ? then now() else null end,now(),now())
                    """,
                id,
                UUID.randomUUID().toString(),
                i,
                i == 2);
        }
        return id;
    }

    private String path(long set) {
        return "/api/v1/sets/" + set + "/save";
    }

    private JsonNode body(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString());
    }

    private final class Browser {
        private final Map<String, Cookie> cookies = new java.util.concurrent.ConcurrentHashMap<>();
        private UUID id;

        void register() throws Exception {
            send(get("/api/v1/auth/csrf"));
            String username = UUID.randomUUID().toString().replace("-", "");
            var result = send(
                post("/api/v1/auth/register").contentType("application/x-www-form-urlencoded")
                    .param("username", username)
                    .param("password", "kanjii")
                    .param("invitation", "libtest1"));
            assertThat(result.getResponse().getStatus()).isEqualTo(200);
            id = jdbc.queryForObject("select id from users where username = ?", UUID.class, username);
            send(get("/api/v1/auth/csrf"));
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
