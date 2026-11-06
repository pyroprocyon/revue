# The app image: Spring Boot serving the API and the React production build at one address.
# `make up` builds it through Docker Compose, and the host builds it for deployment.
# There is no `# syntax=` line on purpose: it would fetch a floating Dockerfile frontend image.
# Docker's built-in frontend already supports the cache mounts used below.
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
 && cp target/revue-*.jar /build/app.jar

# ---- Runtime stage: only the Java runtime and the jar.
FROM eclipse-temurin:25.0.5_8-jre-noble

# Run as a dedicated user with no login shell, not as root.
RUN useradd --system --no-create-home --shell /usr/sbin/nologin revue

# Production settings, from application-prod.properties. Docker Compose sets another profile
# for local development, which runs over plain HTTP.
ENV SPRING_PROFILES_ACTIVE=prod

WORKDIR /app
COPY --from=build /build/app.jar app.jar
USER revue
# 8080 by default. The production profile listens on PORT instead when the host sets it.
EXPOSE 8080
# The free host has 512 MB of memory and 0.1 CPU. Cap the heap at 55% of the container's memory,
# leaving room for class metadata and thread stacks. The Serial collector needs the least memory
# and suits a single slow CPU. Starting values; measure memory and adjust.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=55", "-XX:+UseSerialGC", "-jar", "/app/app.jar"]
