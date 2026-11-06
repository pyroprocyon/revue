package com.revue.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

/**
 * Web security configuration.
 *
 * <p>Only the health check is open, so Docker Compose, the host and an uptime monitor can check
 * the app without signing in. Every other request needs a signed-in user. A signed-out request
 * gets a plain 401 instead of a redirect to a login page, because the React app calls the API
 * with fetch.
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
				.anyRequest().authenticated())
			.exceptionHandling(exceptions -> exceptions
				.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
			// By default Spring Security saves each rejected request in a new session, to redirect
			// back to it after sign-in. Revue never redirects to an address taken from the request,
			// and each saved request would write a session row to PostgreSQL. So turn it off.
			.requestCache(cache -> cache.disable());
		return http.build();
	}

}
