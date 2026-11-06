# Backend image. `make up` builds it through Docker Compose.
# There is no `# syntax=` line on purpose: it would fetch a floating Dockerfile frontend image.
# Docker's built-in frontend already supports the cache mount used below.
# The build context is the repo root, so the frontend build can join this image later,
# when Spring Boot starts serving the React app.

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

# Tests need Docker for Testcontainers, so they run in `make test` and CI, not here.
# The cache mount keeps downloaded dependencies between builds.
RUN --mount=type=cache,target=/root/.m2 \
    sh ./mvnw --batch-mode --no-transfer-progress -DskipTests package \
 && cp target/revue-*.jar /build/app.jar

# ---- Runtime stage: only the Java runtime and the jar.
FROM eclipse-temurin:25.0.5_8-jre-noble

# Run as a dedicated user with no login shell, not as root.
RUN useradd --system --no-create-home --shell /usr/sbin/nologin revue

WORKDIR /app
COPY --from=build /build/app.jar app.jar
USER revue
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
