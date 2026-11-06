package com.revue.web;

import java.time.Duration;

import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.EncodedResourceResolver;

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
 * resolver ignores quality values such as {@code gzip;q=0}.
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

}
