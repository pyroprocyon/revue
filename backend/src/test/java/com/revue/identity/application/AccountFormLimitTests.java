package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;

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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "revue.content.load-on-startup=false"})
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
            var bootstrap = client.send(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/auth/csrf")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
            assertThat(bootstrap.statusCode()).isEqualTo(200);
            String csrf = cookies.getCookieStore()
                .getCookies()
                .stream()
                .filter(cookie -> cookie.getName().equals("XSRF-TOKEN"))
                .findFirst()
                .orElseThrow()
                .getValue();
            for (boolean chunked : new boolean[] {false, true}) {
                String username = UUID.randomUUID().toString().replace("-", "");
                String token = "a".repeat(43);
                String hash = HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
                jdbc.update(
                    "insert into signup_invites (id, token_hash, created_at, "
                        + "expires_at) values (?, ?, now() - interval '1 minute', now() + "
                        + "interval '1 hour') on conflict (token_hash) do nothing",
                    UUID.randomUUID(),
                    hash);
                String form = "username=" + username + "&password=kanjii&invitation=" + token
                    + "&privacy=true&adult=true&padding=" + "x".repeat(10_000);
                var body = chunked
                    ? HttpRequest.BodyPublishers
                        .ofInputStream(() -> new ByteArrayInputStream(form.getBytes(StandardCharsets.UTF_8)))
                    : HttpRequest.BodyPublishers.ofString(form);
                var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/auth/register"))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("X-XSRF-TOKEN", csrf)
                    .POST(body)
                    .build();
                var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                assertThat(response.statusCode()).isIn(400, 413);
                assertThat(
                    jdbc.queryForObject("select count(*) from users where username = ?", Integer.class, username))
                    .isZero();
            }
        }
    }
}
