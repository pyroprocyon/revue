package com.revue.identity.infrastructure;

import com.revue.identity.application.AccountService;
import com.revue.identity.application.PilotInvitation;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.DelegatingSecurityContextRepository;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;

/**
 * Web security configuration.
 *
 * <p>The API and Actuator need a signed-in user, except the health check, which Docker Compose, the host and an uptime
 * monitor call without signing in, and the read-only endpoints behind the public sets and their trials. A signed-out
 * API request gets a plain 401 instead of a redirect to a login page, because the React app calls the API with fetch.
 *
 * <p>Everything outside {@code /api} and {@code /actuator} is the public React build: index.html for every browser
 * route, and the built assets. The React app then asks the API what the visitor may see. Keep every server route under
 * {@code /api}, because anything outside it is public.
 *
 * <p>Invited username/password sign-in uses JDBC sessions and CSRF protection. Email sign-in is not enabled.
 */
@Configuration(proxyBeanMethods = false)
public class SecurityConfig {

    @Bean
    PilotInvitation pilotInvitation(@Value("${REVUE_PILOT_INVITE_CODE:}") String code) {
        return new PilotInvitation(code);
    }

    @Bean
    SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        AccountService accounts,
        CookieCsrfTokenRepository csrf,
        SecurityContextRepository contexts,
        SessionAuthenticationStrategy sessions) {
        var paths = PathPatternRequestMatcher.withDefaults();
        var publicRoutes = new OrRequestMatcher(
            paths.matcher("/actuator/health"),
            paths.matcher("/actuator/health/liveness"),
            paths.matcher("/actuator/health/readiness"),
            paths.matcher(HttpMethod.GET, "/api/v1/public-sets"),
            paths.matcher(HttpMethod.GET, "/api/v1/public-sets/*"),
            paths.matcher(HttpMethod.GET, "/api/v1/public-sets/*/demo-cards"),
            paths.matcher(HttpMethod.GET, "/api/v1/public-sets/share/*/summary"),
            paths.matcher(HttpMethod.GET, "/api/v1/auth/csrf"),
            AccountRoutes.REGISTER,
            AccountRoutes.LOGIN,
            AccountRoutes.LOGOUT);
        http.authorizeHttpRequests(
            requests -> requests.requestMatchers(publicRoutes)
                .permitAll()
                .requestMatchers(AccountRoutes.OPERATIONS)
                .denyAll()
                .requestMatchers(AccountRoutes.API)
                .hasAuthority("LEARNER")
                .anyRequest()
                .permitAll())
            .exceptionHandling(
                exceptions -> exceptions.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            // By default Spring Security saves each rejected request in a new session, to redirect
            // back to it after sign-in. Revue never redirects to an address taken from the request,
            // and each saved request would write a session row to PostgreSQL. So turn it off.
            .requestCache(cache -> cache.disable())
            .csrf(config -> config.csrfTokenRepository(csrf).csrfTokenRequestHandler(new LazySpaCsrfHandler()))
            .securityContext(config -> config.securityContextRepository(contexts))
            .sessionManagement(config -> config.sessionAuthenticationStrategy(sessions))
            .logout(
                config -> config.logoutRequestMatcher(AccountRoutes.LOGOUT)
                    .invalidateHttpSession(true)
                    .clearAuthentication(true)
                    .deleteCookies("SESSION")
                    .addLogoutHandler((request, response, authentication) -> {
                        if (authentication != null && request.getSession(false) != null) {
                            request.setAttribute(AccountOperationLogFilter.AUTHENTICATED_LOGOUT, true);
                        }
                    })
                    .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
            .addFilterBefore(new CurrentAccountFilter(accounts, publicRoutes), AuthorizationFilter.class);
        return http.build();
    }

    @Bean
    CookieCsrfTokenRepository csrfRepository() {
        // The SPA uses the bootstrap response token, so JavaScript need not read this cookie.
        return new CookieCsrfTokenRepository();
    }

    @Bean
    SecurityContextRepository securityContexts() {
        return new DelegatingSecurityContextRepository(
            new RequestAttributeSecurityContextRepository(),
            new HttpSessionSecurityContextRepository());
    }

    @Bean
    SessionAuthenticationStrategy accountSessions(CookieCsrfTokenRepository csrf) {
        return new CompositeSessionAuthenticationStrategy(
            List.of(new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrf)));
    }
}
