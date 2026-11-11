package com.revue.platform.infrastructure;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

/** Operational metrics have separate credentials and never accept learner sessions. */
@Configuration(proxyBeanMethods = false)
public class OperationsSecurityConfig {
    @Bean
    @Order(1)
    SecurityFilterChain operationsSecurity(HttpSecurity http, @Value("${revue.operations.token:}") String token)
        throws Exception {
        if (!token.isEmpty() && token.length() < 32) {
            throw new IllegalArgumentException("Operations token must contain at least 32 characters");
        }
        http.securityMatcher("/actuator/metrics", "/actuator/metrics/**")
            .sessionManagement(sessions -> sessions.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(cache -> cache.disable())
            .authorizeHttpRequests(requests -> requests.anyRequest().access(metricsAccess(token)))
            .exceptionHandling(
                exceptions -> exceptions.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));
        return http.build();
    }

    private static AuthorizationManager<RequestAuthorizationContext> metricsAccess(String token) {
        byte[] expected = ("Bearer " + token).getBytes(StandardCharsets.UTF_8);
        return (authentication, context) -> {
            var request = context.getRequest();
            String supplied = request.getHeader("Authorization");
            boolean allowed = !token.isEmpty()
                && "GET".equals(request.getMethod())
                && supplied != null
                && MessageDigest.isEqual(expected, supplied.getBytes(StandardCharsets.UTF_8));
            return new AuthorizationDecision(allowed);
        };
    }
}
