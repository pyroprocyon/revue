package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.revue.StructuredEvents;
import com.revue.TestcontainersConfiguration;
import java.io.ByteArrayInputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "revue.content.publish=false")
@Import(TestcontainersConfiguration.class)
class AccountFormLimitTests {
    @LocalServerPort
    int port;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void oversizedFixedAndChunkedFormsCannotCreateAccounts() throws Exception {
        CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        try (HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build()) {
            String csrf = csrf(client, cookies);
            for (boolean chunked : new boolean[] {false, true}) {
                String username = UUID.randomUUID().toString().replace("-", "");
                String token = "a".repeat(43);
                insertInvitation(token);
                String form = "username=" + username + "&password=kanjii&invitation=" + token + "&padding="
                    + "x".repeat(10_000);
                var body = chunked
                    ? HttpRequest.BodyPublishers
                        .ofInputStream(() -> new ByteArrayInputStream(form.getBytes(StandardCharsets.UTF_8)))
                    : HttpRequest.BodyPublishers.ofString(form);
                String path = chunked ? "/api/v1/auth/register" : "/%61pi/v1/auth/register";
                var request = HttpRequest.newBuilder(address(path))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("X-XSRF-TOKEN", csrf)
                    .POST(body)
                    .build();
                var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                if (chunked) {
                    assertThat(response.statusCode()).isIn(400, 413);
                } else {
                    assertThat(response.statusCode()).isEqualTo(413);
                    assertThat(response.headers().firstValue("Referrer-Policy")).hasValue("no-referrer");
                }
                assertThat(
                    jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, username))
                    .isZero();
            }
        }
    }

    @Test
    void encodedAuthRoutesKeepTheirSessionEvents(CapturedOutput output) throws Exception {
        var cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        try (var client = HttpClient.newBuilder().cookieHandler(cookies).build()) {
            String username = UUID.randomUUID().toString().replace("-", "");
            String token = UUID.randomUUID().toString().replace("-", "").substring(0, 22);
            insertInvitation(token);
            String credentials = "username=" + username + "&password=kanjii";
            String csrf = csrf(client, cookies);
            assertThat(post(client, "/api/v1/auth/register", csrf, credentials + "&invitation=" + token))
                .isEqualTo(200);
            csrf = csrf(client, cookies);
            assertThat(post(client, "/api/v1/auth/log%69n", csrf, "username=" + username + "&password=incorrect"))
                .isEqualTo(401);
            assertThat(post(client, "/%61pi/v1/auth/login", csrf, credentials)).isEqualTo(200);
            var profile = client.send(
                HttpRequest.newBuilder(address("/%61pi/v1/me")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
            assertThat(profile.statusCode()).isEqualTo(200);
            assertThat(profile.body()).contains(username);
            assertThat(profile.headers().firstValue("Cache-Control")).hasValue("no-store, private");
            assertThat(post(client, "/api/v1/auth/log%6Fut", csrf(client, cookies), "")).isEqualTo(204);
        }

        var loginEvents = StructuredEvents.named(output, "auth.login");
        assertThat(loginEvents).extracting(event -> event.at("/event/outcome").asString())
            .containsExactly("rejected", "success");
        assertThat(loginEvents).extracting(event -> event.at("/operation/id").asString())
            .doesNotContain("")
            .doesNotHaveDuplicates();
        assertThat(StructuredEvents.named(output, "auth.logout")).singleElement()
            .satisfies(event -> assertThat(event.at("/state/to").asString()).isEqualTo("signed_out"));
    }

    private String csrf(HttpClient client, CookieManager cookies) throws Exception {
        var request = HttpRequest.newBuilder(address("/api/v1/auth/csrf")).GET().build();
        assertThat(client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(200);
        return cookies.getCookieStore()
            .getCookies()
            .stream()
            .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
            .findFirst()
            .orElseThrow()
            .getValue();
    }

    private int post(HttpClient client, String path, String csrf, String form) throws Exception {
        var request = HttpRequest.newBuilder(address(path))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("X-XSRF-TOKEN", csrf)
            .POST(HttpRequest.BodyPublishers.ofString(form))
            .build();
        return client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    private URI address(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private void insertInvitation(String token) throws Exception {
        String hash = HexFormat.of()
            .formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        jdbc.update(
            "insert into signup_invites (id, token_hash, created_at, "
                + "expires_at) values (?, ?, now() - interval '1 minute', now() + "
                + "interval '1 hour') on conflict (token_hash) do nothing",
            UUID.randomUUID(),
            hash);
    }
}
