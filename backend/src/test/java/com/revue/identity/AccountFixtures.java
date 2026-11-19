package com.revue.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.springframework.test.web.servlet.MockMvc;

/** Authenticate through the actual pilot flow rather than bypassing account/version checks. */
public final class AccountFixtures {
    private AccountFixtures() {
    }

    /** Registers a disposable account through the real HTTP flow and returns its cookies. */
    public static Cookie[] signedIn(MockMvc mvc) throws Exception {
        Cookie csrf = mvc.perform(get("/api/v1/auth/csrf")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertThat(csrf).isNotNull();
        var response = mvc
            .perform(
                post("/api/v1/auth/register").contentType("application/x-www-form-urlencoded")
                    .cookie(csrf)
                    .header("X-XSRF-TOKEN", csrf.getValue())
                    .param("username", UUID.randomUUID().toString().replace("-", ""))
                    .param("password", "kanjii"))
            .andReturn()
            .getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getCookie("SESSION")).isNotNull();
        return new Cookie[] {response.getCookie("SESSION")};
    }
}
