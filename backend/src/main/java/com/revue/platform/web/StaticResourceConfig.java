package com.revue.platform.web;

import java.time.Duration;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.EncodedResourceResolver;
import org.springframework.web.servlet.resource.ResourceHttpRequestHandler;

/**
 * Serves the React production build, which the Docker image copies to {@code classpath:/static/}.
 *
 * <p>Vite names each file under {@code /assets/} after a hash of its content, so a changed file
 * gets a new name. Browsers may cache those files for a year. Every other file, including
 * index.html, must be fetched again on each visit, because index.html names the current asset
 * files. Those files also send no Last-Modified date. After a rollback, the older index.html has
 * an older date, so a browser revalidating with its newer date would get 304 and keep an
 * index.html that names assets the running image doesn't have.
 *
 * <p>The frontend build writes .br and .gz copies next to each text file. When the browser accepts
 * one, Spring serves the copy, so the small server CPU never compresses a file on each request.
 * {@link AcceptEncodingFilter} first removes the formats a client rejected, because Spring's
 * resolver ignores quality values such as {@code gzip;q=0}. Every answer from these handlers says
 * {@code Vary: Accept-Encoding}, so a shared cache keeps the plain file and each copy apart.
 *
 * <p>{@code spring.web.resources.add-mappings=false} turns off Spring Boot's own static file
 * handler, because its settings give every file the same cache rule.
 */
@Configuration(proxyBeanMethods = false)
class StaticResourceConfig implements WebMvcConfigurer {

	private static final String BUILD_LOCATION = "classpath:/static/";

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler("/assets/**")
			.addResourceLocations(BUILD_LOCATION + "assets/")
			.setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
			.resourceChain(true)
			.addResolver(new EncodedResourceResolver());
		registry.addResourceHandler("/**")
			.addResourceLocations(BUILD_LOCATION)
			.setCacheControl(CacheControl.noCache())
			.setUseLastModified(false)
			.resourceChain(true)
			.addResolver(new EncodedResourceResolver());
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(new VaryByAcceptEncoding());
	}

	/**
	 * Adds {@code Vary: Accept-Encoding} before a static file handler runs. Spring adds it itself
	 * only when it serves a .br or .gz copy. Without it, a shared cache could store the plain file
	 * and hand it to clients that accept a smaller copy. Spring also answers a 304 before it adds
	 * the copy's headers, so the header has to be on the response before the handler starts.
	 */
	private static final class VaryByAcceptEncoding implements HandlerInterceptor {

		@Override
		public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
			if (handler instanceof ResourceHttpRequestHandler) {
				response.addHeader(HttpHeaders.VARY, HttpHeaders.ACCEPT_ENCODING);
			}
			return true;
		}

	}

}
