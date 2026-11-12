package com.revue.identity.infrastructure;

import static org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.pathPattern;

import org.springframework.http.HttpMethod;
import org.springframework.security.web.util.matcher.RequestMatcher;

/** Shares route matching between the security chain and account filters. */
final class AccountRoutes {
    static final RequestMatcher REGISTER = pathPattern(HttpMethod.POST, "/api/v1/auth/register");
    static final RequestMatcher LOGIN = pathPattern(HttpMethod.POST, "/api/v1/auth/login");
    static final RequestMatcher LOGOUT = pathPattern(HttpMethod.POST, "/api/v1/auth/logout");
    static final RequestMatcher AUTH = pathPattern("/api/v1/auth/**");
    static final RequestMatcher PROFILE = pathPattern("/api/v1/me");
    static final RequestMatcher API = pathPattern("/api/**");
    static final RequestMatcher OPERATIONS = pathPattern("/actuator/**");

    private AccountRoutes() {
    }
}
