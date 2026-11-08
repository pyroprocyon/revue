package com.revue.identity.infrastructure;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

/**
 * Web security configuration.
 *
 * <p>The API and Actuator need a signed-in user, except the health check, which Docker Compose,
 * the host and an uptime monitor call without signing in, and the read-only endpoints behind the
 * public sets and their trials. A signed-out API request gets a plain 401 instead of a redirect to
 * a login page, because the React app calls the API with fetch.
 *
 * <p>Everything outside {@code /api} and {@code /actuator} is the public React build: index.html
 * for every browser route, and the built assets. The React app then asks the API what the visitor
 * may see. Keep every server route under {@code /api}, because anything outside it is public.
 *
 * <p>Email sign-in, sessions and CSRF protection are added here with the sign-in work.
 */
@Configuration(proxyBeanMethods = false)
public class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http
			.authorizeHttpRequests(requests -> requests
				// Any method, because some uptime monitors send HEAD instead of GET.
				.requestMatchers("/actuator/health").permitAll()
				// The public sets, one set's preview and its trial cards (plan section 10).
				.requestMatchers(HttpMethod.GET, "/api/v1/public-sets", "/api/v1/public-sets/*",
						"/api/v1/public-sets/*/demo-cards")
				.permitAll()
				.requestMatchers("/api/**", "/actuator/**").authenticated()
				.anyRequest().permitAll())
			.exceptionHandling(exceptions -> exceptions
				.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
			// By default Spring Security saves each rejected request in a new session, to redirect
			// back to it after sign-in. Revue never redirects to an address taken from the request,
			// and each saved request would write a session row to PostgreSQL. So turn it off.
			.requestCache(cache -> cache.disable());
		return http.build();
	}

}
