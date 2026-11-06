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
FROM eclipse-temurin:25.0.5_8-jre-noble

# Run as a dedicated user with no login shell, not as root.
RUN useradd --system --no-create-home --shell /usr/sbin/nologin revue

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
# schema check and metadata lookup, and the pool's fail-fast check.
# The cache only works with this same JVM, classpath and jar timestamps, so it's made here, in the
# runtime image, with the same JVM options as the start command. If a start can't use the cache,
# Java warns and starts without it.
RUN java -XX:AOTCacheOutput=app.aot -XX:MaxRAMPercentage=55 -XX:+UseSerialGC \
      -Dspring.context.exit=onRefresh \
      -Dspring.datasource.url=jdbc:postgresql://127.0.0.1:1/aot-training \
      -Dspring.datasource.hikari.initialization-fail-timeout=-1 \
      -Dspring.datasource.hikari.connection-timeout=250 \
      -Dspring.flyway.enabled=false \
      -Dspring.jpa.hibernate.ddl-auto=none \
      -Dspring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect \
      -Dspring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false \
      -jar app.jar

USER revue
# 8080 by default. The production profile listens on PORT instead when the host sets it.
EXPOSE 8080
# The free host has 512 MB of memory and 0.1 CPU. Cap the heap at 55% of the container's memory,
# leaving room for class metadata and thread stacks. The Serial collector needs the least memory
# and suits a single slow CPU. Starting values; measure memory and adjust.
ENTRYPOINT ["java", "-XX:AOTCache=app.aot", "-XX:MaxRAMPercentage=55", "-XX:+UseSerialGC", "-jar", "app.jar"]
