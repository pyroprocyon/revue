package com.revue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;

import com.revue.identity.AccountFixtures;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The production profile, which the Docker image turns on (application-prod.properties). The host's proxy ends HTTPS
 * and forwards plain HTTP, so the app must read the forwarded scheme and mark the session cookie Secure without relying
 * on the request being secure.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("prod")
@Import({TestcontainersConfiguration.class, ProductionProfileTests.RequestSchemeEndpoint.class})
class ProductionProfileTests {

    @Autowired private MockMvc mvc;

    @Autowired private JdbcTemplate jdbc;

    @Autowired private CookieSerializer cookieSerializer;

    @Test
    void theSessionCookieIsSecureBehindThePlainHttpProxy() {
        assertThat(SessionAndPoolSettingsTests.writeSessionCookie(cookieSerializer)).contains("Secure");
    }

    @Test
    void requestsForwardedFromHttpsCountAsHttps() throws Exception {
        var cookies = AccountFixtures.signedIn(mvc, jdbc);
        mvc.perform(get(RequestSchemeEndpoint.PATH).cookie(cookies).header("X-Forwarded-Proto", "https"))
                .andExpect(content().string("https"));
        mvc.perform(get(RequestSchemeEndpoint.PATH).cookie(cookies)).andExpect(content().string("http"));
    }

    /** A test-only endpoint that reports the scheme the app sees for a request. */
    @TestConfiguration(proxyBeanMethods = false)
    static class RequestSchemeEndpoint {

        static final String PATH = "/api/v1/test/request-scheme";

        @Bean
        RequestSchemeController requestSchemeController() {
            return new RequestSchemeController();
        }
    }

    @RestController
    static class RequestSchemeController {

        @GetMapping(RequestSchemeEndpoint.PATH)
        String scheme(HttpServletRequest request) {
            return request.getScheme();
        }
    }
}
