package com.revue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.revue.identity.AccountFixtures;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.zip.GZIPInputStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Spring Boot serves the React production build at the same address as the API (plan sections 3 and 13). These tests
 * run a real server, because forwards, error pages and compressed files only behave as deployed in a real servlet
 * container. They serve a small stand-in build from src/test/resources/static; {@code make smoke} checks the real build
 * inside the Docker image.
 *
 * <p>A plain {@link HttpClient} sends the requests, so nothing decodes a compressed body or follows a redirect on the
 * test's behalf.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class StaticServingTests {

    private static final String ASSET = "/assets/app-test1234.js";

    private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();

    @LocalServerPort
    private int port;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private Semaphore publicCatalogPermits;

    @Test
    void largeJsonResponsesAreCompressedWithoutChangingTheirContent() throws IOException {
        String key = "compression-" + UUID.randomUUID();
        long set = insertSet(key, "Question ".repeat(45), "Answer ".repeat(50));
        try {
            String path = "/api/v1/public-sets/" + key + "/demo-cards";
            var plain = sendBytes(path, null);
            var compressed = sendBytes(path, "gzip");
            assertThat(plain.statusCode()).isEqualTo(200);
            assertThat(plain.body()).hasSizeGreaterThan(2048);
            assertThat(header(compressed, "Content-Encoding")).isEqualTo("gzip");
            assertThat(compressed.body()).hasSizeLessThan(plain.body().length);
            try (var gzip = new GZIPInputStream(new ByteArrayInputStream(compressed.body()))) {
                assertThat(gzip.readAllBytes()).isEqualTo(plain.body());
            }
            assertThat(sendBytes(path, "gzip;q=0").headers().firstValue("Content-Encoding")).isEmpty();
            assertThat(sendBytes("/api/v1/auth/session", "gzip").headers().firstValue("Content-Encoding")).isEmpty();
        } finally {
            retireSet(set);
        }
    }

    @Test
    void catalogPagesBelowTheThresholdStayUncompressed() {
        var page = sendBytes("/api/v1/public-sets?limit=1", "gzip");

        assertThat(page.statusCode()).isEqualTo(200);
        assertThat(page.body()).hasSizeLessThan(2048);
        assertThat(page.headers().firstValue("Content-Encoding")).isEmpty();
        assertThat(header(page, "Content-Length")).isEqualTo(String.valueOf(page.body().length));
    }

    @Test
    void catalogResponsesKeepTheirJsonContentNegotiation() {
        String key = "negotiation-" + UUID.randomUUID();
        long set = insertSet(key, "Question", "Answer");
        try {
            String setPath = "/api/v1/public-sets/" + key;
            for (String path : List.of("/api/v1/public-sets?limit=1", setPath, setPath + "/demo-cards")) {
                assertThat(sendBytes(path, null, "Accept", "text/plain").statusCode()).isEqualTo(406);
                var vendorJson = sendBytes(path, null, "Accept", "application/vnd.revue+json");
                assertThat(vendorJson.statusCode()).isEqualTo(200);
                assertThat(header(vendorJson, "Content-Type")).startsWith("application/vnd.revue+json");
            }
        } finally {
            retireSet(set);
        }
    }

    @Test
    void sharedAndFullReviewerLinksServeCurrentEscapedMetadataWithoutJavascript() {
        String key = "share-preview-" + UUID.randomUUID();
        long id = insertSet(key, "Other question sentinel", "Answer sentinel");
        String shortPath = "/s/" + Long.toString(id, 36);
        String fullPath = "/sets/" + key;
        try {
            jdbc.update(
                "update sets set title = ?, description = ? where id = ?",
                "Music & Math",
                "₱70 for \"A<B>\"?",
                id);
            jdbc.update("update cards set question = ? where set_id = ? and position = 1", "Public sample <one>", id);
            for (String path : List.of(shortPath, fullPath)) {
                var response = send("GET", path);
                assertThat(response.statusCode()).isEqualTo(200);
                assertThat(header(response, "Cache-Control")).isEqualTo("no-store");
                assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
                assertThat(response.body()).containsOnlyOnce("property=\"og:title\"")
                    .containsOnlyOnce("property=\"og:description\"")
                    .contains(
                        "content=\"Music &amp; Math\"",
                        "content=\"₱70 for &quot;A&lt;B&gt;&quot;?\"",
                        "&quot;sampleQuestion&quot;:&quot;Public sample &lt;one&gt;&quot;",
                        "/assets/app-test1234.js",
                        "id=\"root\"")
                    .doesNotContain("Test app description", "Other question sentinel", "Answer sentinel");
                var head = send("HEAD", path);
                assertThat(head.statusCode()).isEqualTo(200);
                assertThat(head.body()).isEmpty();
                assertThat(header(head, "X-Robots-Tag")).isEqualTo(path.equals(shortPath) ? "noindex" : "(missing)");
            }
            jdbc.update("update sets set title = 'Updated reviewer' where id = ?", id);
            assertThat(send("GET", shortPath).body()).contains("content=\"Updated reviewer\"");
        } finally {
            retireSet(id);
        }
        for (String path : List.of(shortPath, fullPath)) {
            assertThat(send("GET", path).body()).isEqualTo(fixture("static/index.html"));
        }
    }

    @Test
    void busyCatalogLeavesThePreviewShellAvailableAndRecoversItsSharedCapacity() {
        String key = "preview-capacity-" + UUID.randomUUID();
        long id = insertSet(key, "Question", "Answer");
        List<String> paths = List.of("/s/" + Long.toString(id, 36), "/sets/" + key);
        try {
            assertThat(publicCatalogPermits.tryAcquire(3)).isTrue();
            try {
                assertThat(send("GET", "/api/v1/public-sets/" + key).statusCode()).isEqualTo(503);
                for (String path : paths) {
                    assertThat(send("GET", path).body()).isEqualTo(fixture("static/index.html"));
                }
            } finally {
                publicCatalogPermits.release(3);
            }
            for (String path : paths) {
                assertThat(send("GET", path).body()).contains("name=\"revue:reviewer\"");
            }
            assertThat(publicCatalogPermits.availablePermits()).isEqualTo(3);
        } finally {
            retireSet(id);
        }
    }

    @Test
    void currentReviewerPagesNegotiateGzipIdentityAndUnacceptableEncodings() throws IOException {
        String key = "preview-encoding-" + UUID.randomUUID();
        long id = insertSet(key, "Question", "Answer");
        try {
            for (String path : List.of("/s/" + Long.toString(id, 36), "/sets/" + key)) {
                var plain = sendBytes(path, "gzip;q=0, identity");
                assertThat(plain.statusCode()).isEqualTo(200);
                assertThat(plain.headers().firstValue("Content-Encoding")).isEmpty();
                var compressed = sendBytes(path, "gzip", "Accept-Encoding", "identity;q=0");
                assertThat(compressed.statusCode()).isEqualTo(200);
                assertThat(header(compressed, "Content-Encoding")).isEqualTo("gzip");
                assertThat(vary(compressed)).contains("Accept-Encoding");
                try (var gzip = new GZIPInputStream(new ByteArrayInputStream(compressed.body()))) {
                    assertThat(gzip.readAllBytes()).isEqualTo(plain.body());
                }
                var head = HttpRequest.newBuilder(uri(path))
                    .header("Accept-Encoding", "gzip, identity;q=0")
                    .method("HEAD", HttpRequest.BodyPublishers.noBody())
                    .build();
                var headResponse = exchange(head, HttpResponse.BodyHandlers.ofByteArray());
                assertThat(header(headResponse, "Content-Encoding")).isEqualTo("gzip");
                assertThat(headResponse.body()).isEmpty();
                assertThat(sendBytes(path, "br, *;q=0").statusCode()).isEqualTo(406);
                assertThat(sendBytes(path, "gzip;q=0.5, identity;q=1").headers().firstValue("Content-Encoding"))
                    .isEmpty();
            }
        } finally {
            retireSet(id);
        }
    }

    private long insertSet(String key, String question, String answer) {
        long set = jdbc.queryForObject("""
            insert into sets(set_key,title,description,publisher_name,subject,created_at,updated_at)
            values (?, 'Compression', '', 'Revue', 'Science', now(), now()) returning id
            """, Long.class, key);
        jdbc.update("""
            insert into cards(set_id,content_key,position,question,answer,created_at,updated_at)
            select ?, ? || n, n, ?, ?, now(), now()
            from generate_series(1,5) n
            """, set, key, question, answer);
        return set;
    }

    private void retireSet(long set) {
        jdbc.update("update cards set retired_at = now() where set_id = ?", set);
        jdbc.update("update sets set retired_at = now() where id = ?", set);
    }

    @Test
    void reloadingOneBrowserRouteServesTheAppKeptOutOfSearch() {
        HttpResponse<String> response = send("GET", "/review/42");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo(fixture("static/index.html"));
        assertThat(header(response, "Content-Type")).startsWith("text/html");
        assertThat(header(response, "X-Robots-Tag")).isEqualTo("noindex");
        // index.html names the current asset files, so browsers must fetch it again on each visit.
        assertThat(header(response, "Cache-Control")).isEqualTo("no-cache");
        assertThat(response.headers().firstValue("Last-Modified")).isEmpty();
        // The page also comes compressed, so caches must keep the plain and compressed answers apart.
        assertThat(vary(response)).containsExactly("Accept-Encoding");
    }

    @Test
    void browserRoutesAnswerHeadRequests() {
        HttpResponse<String> response = send("HEAD", "/review/42");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEmpty();
        assertThat(header(response, "X-Robots-Tag")).isEqualTo("noindex");
    }

    @Test
    void onlyTheHomePageTheSetListAndSetPreviewsCanBeIndexed() {
        for (String path : new String[] {"/", "/sets", "/sets/unknown-" + UUID.randomUUID()}) {
            HttpResponse<String> response = send("GET", path);

            assertThat(response.statusCode()).as(path).isEqualTo(200);
            assertThat(response.body()).as(path).isEqualTo(fixture("static/index.html"));
            assertThat(response.headers().firstValue("X-Robots-Tag")).as(path).isEmpty();
        }
        for (String path : new String[] {"/sets/philippine-history/try", "/sets/Not_A_Key"}) {
            HttpResponse<String> response = send("GET", path);

            assertThat(response.statusCode()).as(path).isEqualTo(200);
            assertThat(header(response, "X-Robots-Tag")).as(path).isEqualTo("noindex");
        }
    }

    @Test
    void hashedAssetsAreCachedForOneYearAndServedPrecompressed() {
        HttpResponse<byte[]> brotli = sendBytes(ASSET, "br");
        assertThat(brotli.statusCode()).isEqualTo(200);
        assertThat(header(brotli, "Content-Encoding")).isEqualTo("br");
        assertThat(brotli.body()).isEqualTo(fixtureBytes("static" + ASSET + ".br"));
        assertThat(vary(brotli)).containsExactly("Accept-Encoding");
        assertThat(header(brotli, "Cache-Control")).contains("max-age=31536000", "public", "immutable");

        HttpResponse<byte[]> gzip = sendBytes(ASSET, "gzip");
        assertThat(header(gzip, "Content-Encoding")).isEqualTo("gzip");
        assertThat(gzip.body()).isEqualTo(fixtureBytes("static" + ASSET + ".gz"));

        // A shared cache that stores the plain file must not hand it to clients that accept a copy.
        HttpResponse<byte[]> plain = sendBytes(ASSET, null);
        assertThat(plain.headers().firstValue("Content-Encoding")).isEmpty();
        assertThat(plain.body()).isEqualTo(fixtureBytes("static" + ASSET));
        assertThat(vary(plain)).containsExactly("Accept-Encoding");
        assertThat(header(plain, "Cache-Control")).contains("max-age=31536000", "public", "immutable");
    }

    @Test
    void theNotModifiedAnswerStillVariesByAcceptEncoding() {
        // Spring answers 304 before it adds a compressed copy's headers, so this checks that the
        // Vary header comes from somewhere that runs first.
        for (String acceptEncoding : new String[] {"br", null}) {
            String lastModified = header(sendBytes(ASSET, acceptEncoding), "Last-Modified");

            HttpResponse<byte[]> notModified = sendBytes(ASSET, acceptEncoding, "If-Modified-Since", lastModified);

            assertThat(notModified.statusCode()).as(acceptEncoding).isEqualTo(304);
            assertThat(vary(notModified)).as(acceptEncoding).containsExactly("Accept-Encoding");
        }
    }

    @Test
    void compressionPreferencesSurviveAlternatingRequestsForTheSameFile() {
        for (String path : new String[] {"/review/42", ASSET}) {
            assertThat(header(sendBytes(path, "gzip, deflate, br, zstd"), "Content-Encoding")).isEqualTo("br");
            assertThat(header(sendBytes(path, "br;q=0.5, gzip"), "Content-Encoding")).isEqualTo("gzip");
            assertThat(header(sendBytes(path, "gzip;q=0.5, br;q=0.5"), "Content-Encoding")).isEqualTo("br");
        }
    }

    @Test
    void theFormatTheClientRejectsIsNeverServed() {
        // A weight of zero rejects a format (RFC 9110, section 12.5.3).
        for (String path : new String[] {"/", "/review/42", ASSET}) {
            byte[] plain = fixtureBytes(path.equals(ASSET) ? "static" + ASSET : "static/index.html");
            // Fill Spring's resource cache with compressed answers first, because its cache key
            // ignores weights and could hand them to a later request.
            assertThat(header(sendBytes(path, "gzip"), "Content-Encoding")).as(path).isEqualTo("gzip");
            assertThat(header(sendBytes(path, "br"), "Content-Encoding")).as(path).isEqualTo("br");

            HttpResponse<byte[]> gzipRejected = sendBytes(path, "gzip;q=0, identity");
            assertThat(gzipRejected.headers().firstValue("Content-Encoding")).as(path).isEmpty();
            assertThat(gzipRejected.body()).as(path).isEqualTo(plain);

            assertThat(header(sendBytes(path, "br;q=0, gzip"), "Content-Encoding")).as(path).isEqualTo("gzip");

            HttpResponse<byte[]> bothRejected = sendBytes(path, "br;q=0, gzip;q=0");
            assertThat(bothRejected.headers().firstValue("Content-Encoding")).as(path).isEmpty();
            assertThat(bothRejected.body()).as(path).isEqualTo(plain);

            // "*" accepts every format the header doesn't name, so refusing the plain file gets a copy.
            HttpResponse<byte[]> plainRejected = sendBytes(path, "*;q=1, identity;q=0");
            assertThat(header(plainRejected, "Content-Encoding")).as(path).isIn("br", "gzip");

            // Repeated header lines form one list (RFC 9110, section 5.2), so a refusal on the second
            // line still overrides the "*" on the first.
            HttpResponse<byte[]> splitHeader = sendBytes(path, "*", "Accept-Encoding", "br;q=0, gzip;q=0, identity");
            assertThat(splitHeader.headers().firstValue("Content-Encoding")).as(path).isEmpty();
            assertThat(splitHeader.body()).as(path).isEqualTo(plain);
        }
    }

    @Test
    void theMalformedAcceptEncodingIsIgnored() {
        // An entry of only semicolons used to make the filter fail with a 500, health check included.
        for (String path : new String[] {"/actuator/health", "/", ASSET}) {
            HttpResponse<byte[]> response = sendBytes(path, ";");

            assertThat(response.statusCode()).as(path).isEqualTo(200);
            assertThat(response.headers().firstValue("Content-Encoding")).as(path).isEmpty();
        }
    }

    @Test
    void theMissingFileGets404InsteadOfThePage() {
        // A tab left open across a deploy asks for an asset the new build doesn't have.
        for (String path : new String[] {"/assets/app-gone5678.js", "/wp-login.php"}) {
            HttpResponse<String> response = send("GET", path);

            assertThat(response.statusCode()).as(path).isEqualTo(404);
            assertThat(response.body()).as(path).doesNotContain("id=\"root\"");
        }
    }

    @Test
    void apiRoutesNeverFallBackToThePage() throws Exception {
        assertThat(send("GET", "/api/v1/unknown").statusCode()).isEqualTo(401);
        assertThat(send("GET", "/api/unknown").statusCode()).isEqualTo(401);
        // Signed in, an unknown API route is a plain 404, not the React page.
        mvc.perform(get("/api/v1/unknown").cookie(AccountFixtures.signedIn(mvc))).andExpect(status().isNotFound());
    }

    @Test
    void servingTheAppCreatesNoSession() {
        int sessionsBefore = countSessions();

        for (String path : new String[] {"/", "/review/42", ASSET}) {
            assertThat(send("GET", path).headers().firstValue("Set-Cookie")).as(path).isEmpty();
        }
        assertThat(countSessions()).isEqualTo(sessionsBefore);
    }

    private HttpResponse<String> send(String method, String path) {
        HttpRequest request = HttpRequest.newBuilder(uri(path))
            .method(method, HttpRequest.BodyPublishers.noBody())
            .build();
        return exchange(request, HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<byte[]> sendBytes(String path, String acceptEncoding, String... headers) {
        HttpRequest.Builder request = HttpRequest.newBuilder(uri(path)).GET();
        if (acceptEncoding != null) {
            request.header("Accept-Encoding", acceptEncoding);
        }
        if (headers.length > 0) {
            request.headers(headers);
        }
        return exchange(request.build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    private <T> HttpResponse<T> exchange(HttpRequest request, HttpResponse.BodyHandler<T> body) {
        try {
            return http.send(request, body);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(ex);
        }
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private static String header(HttpResponse<?> response, String name) {
        return response.headers().firstValue(name).orElse("(missing)");
    }

    /** Every Vary value, so a header sent twice fails the check too. */
    private static List<String> vary(HttpResponse<?> response) {
        return response.headers().allValues("Vary");
    }

    private static String fixture(String path) {
        return new String(fixtureBytes(path), StandardCharsets.UTF_8);
    }

    private static byte[] fixtureBytes(String path) {
        try {
            return new ClassPathResource(path).getContentAsByteArray();
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    private int countSessions() {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM spring_session", Integer.class);
        return count == null ? 0 : count;
    }
}
