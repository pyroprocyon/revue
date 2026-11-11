package com.revue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.revue.identity.AccountFixtures;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
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
        for (String path : new String[] {"/", "/sets", "/sets/philippine-history"}) {
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
        mvc.perform(get("/api/v1/unknown").cookie(AccountFixtures.signedIn(mvc, jdbc)))
            .andExpect(status().isNotFound());
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
