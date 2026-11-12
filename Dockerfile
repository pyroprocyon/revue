# The app image: Spring Boot serving the API and the React production build at one address.
# `make up` builds it through Docker Compose, and the host builds it for deployment.
# There is no `# syntax=` line on purpose: it would fetch a floating Dockerfile frontend image.
# Docker's built-in frontend already supports the cache mounts used below.
# The image also holds Java's AOT cache for faster starts; see the runtime stage.
# The build context is the repo root, so both the frontend and the backend are available.

# ---- Frontend stage: build the React app with the pinned Node version.
FROM node:26.13.0-bookworm-slim AS frontend

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
# Type-checks, builds into dist/ and writes .br and .gz copies of the text files.
RUN npm run build

# ---- Build stage: package the Spring Boot jar with the Maven Wrapper.
FROM eclipse-temurin:25.0.5_8-jdk-noble AS build

# The wrapper unzips Maven's .zip and checks it against the pinned SHA-256.
# This image has no unzip, and without it the wrapper downloads the .tar.gz instead,
# which fails that check. So install unzip in this stage only.
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY backend/ ./
# The shared set files. pom.xml packages ../content/public into the jar, and ../content from
# /build is /content.
COPY content/public/ /content/public/
# Spring Boot serves the files under static/ in the jar. The backend tests use their own small
# copy in src/test/resources instead, so they don't need a frontend build.
COPY --from=frontend /frontend/dist/ ./src/main/resources/static/

# Tests need Docker for Testcontainers, so they run in `make test` and CI, not here.
# The cache mount keeps downloaded dependencies between builds.
RUN --mount=type=cache,target=/root/.m2 \
    sh ./mvnw --batch-mode --no-transfer-progress -DskipTests package \
 && cp target/revue-*.jar /build/app.jar \
 && java -Djarmode=tools -jar /build/app.jar extract --destination /build/extracted

# ---- Runtime stage: only the Java runtime and the app.
FROM eclipse-temurin:25.0.5_8-jre-alpine

# Run as a dedicated user with no login shell, not as root.
RUN adduser -S -H -s /sbin/nologin revue

# Production settings, from application-prod.properties. Docker Compose sets another profile
# for local development, which runs over plain HTTP.
ENV SPRING_PROFILES_ACTIVE=prod

WORKDIR /app
# The jar's extracted form: app.jar holds the app's own classes and names the libraries in lib/.
# Java's AOT cache below works only with this form, not with the single executable jar.
COPY --from=build /build/extracted/ ./

# Java's ahead-of-time cache. A training run starts the app once and saves the classes the JVM
# loaded and linked, so later starts skip that work. spring.context.exit=onRefresh stops the app
# once its beans exist, before the web server starts. The host's build has no database, so the run
# points at a closed local port and turns off what would connect or wait: Flyway, Hibernate's
# schema check and metadata lookup, the pool's fail-fast check and the content loader. Two log levels hide the expected
# warnings this causes: Spring failing to read the database name, and Hibernate saying the dialect
# setting isn't needed, which it is here, because the run never reads the database's metadata.
# The cache only works with this same JVM, classpath and jar timestamps, so it's made here, in the
# runtime image, with the same JVM options as the start command. If a start can't use the cache,
# Java warns and starts without it.
# -XX:MaxRAM=512m sizes the training JVM like the 512 MB instance, whatever the build machine has.
# The heap decides how Java stores object references: above 32 GB, compressed references are off.
# Without this flag, a build machine with 58 GB or more makes a cache the 512 MB instance rejects,
# as Render's first deploy with the cache showed.
# The last command checks that a 512 MB start can use the cache, and fails the build if not.
RUN java -XX:AOTCacheOutput=app.aot -XX:MaxRAM=512m -Xms64m -XX:MaxRAMPercentage=45 -XX:+UseSerialGC \
      -Dspring.context.exit=onRefresh \
      -Dspring.datasource.url=jdbc:postgresql://127.0.0.1:1/aot-training \
      -Dspring.datasource.hikari.initialization-fail-timeout=-1 \
      -Dspring.datasource.hikari.connection-timeout=250 \
      -Dspring.flyway.enabled=false \
      -Drevue.content.publish=false \
      -Dspring.jpa.hibernate.ddl-auto=none \
      -Dspring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect \
      -Dspring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false \
      -Dlogging.level.org.springframework.jdbc.support.SQLErrorCodesFactory=ERROR \
      -Dlogging.level.org.hibernate.orm.deprecation=ERROR \
      -jar app.jar \
 && java -XX:AOTCache=app.aot -XX:AOTMode=on -XX:MaxRAM=512m -Xms64m -XX:MaxRAMPercentage=45 -XX:+UseSerialGC \
      -cp app.jar -version

USER revue
# 8080 by default. The production profile listens on PORT instead when the host sets it.
EXPOSE 8080
# Render Starter has 512 MB of memory and 0.5 CPU. Cap the heap at 45% of the container's memory,
# leaving room for the AOT cache, class metadata, thread stacks and other native allocations.
# The Serial collector suits this CPU budget. Measure memory under load before raising the cap.
# -Xms64m starts the heap at 64 MB instead of about 8 MB (1/64 of 512 MB). The Serial collector
# copies the AOT cache's stored heap objects into the heap at startup, and they no longer fit in
# 8 MB once the app loads its JPA repositories: the check above then fails with "archived heap
# objects cannot be loaded". On 2026-11-07 the cache needed 12 MB, so 64 MB leaves room to grow,
# and Spring's startup grows the heap past 64 MB anyway.
ENTRYPOINT ["java", "-XX:AOTCache=app.aot", "-Xms64m", "-XX:MaxRAMPercentage=45", "-XX:+UseSerialGC", "-jar", "app.jar"]
