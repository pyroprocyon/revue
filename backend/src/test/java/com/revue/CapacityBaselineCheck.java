package com.revue;

import static org.assertj.core.api.Assertions.assertThat;

import com.revue.content.application.CatalogPublisher;
import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.SetDefinition;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

/** Opt-in local measurement, never a deployment capacity promise. Uses only a disposable test database. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "server.tomcat.threads.max=20")
@Import(TestcontainersConfiguration.class)
class CapacityBaselineCheck {
    @LocalServerPort
    private int port;
    @Autowired
    private CatalogPublisher publisher;

    @Test
    void measurePublicReadsAgainstLargerSyntheticCatalog() throws Exception {
        var source = IntStream.range(0, 1000).mapToObj(index -> {
            String key = "synthetic-" + index;
            var cards = IntStream.range(0, 20)
                .mapToObj(
                    card -> new CardDefinition(
                        key + "-" + card,
                        "Synthetic question " + card + "?",
                        "Answer",
                        List.of("Answer"),
                        null,
                        null,
                        "Synthetic source"))
                .toList();
            return new SetDefinition(
                key,
                key,
                String.format(Locale.ROOT, "Set %04d", index),
                "Synthetic description",
                "Synthetic publisher",
                "Synthetic subject",
                cards);
        }).toList();
        long publicationStart = System.nanoTime();
        publisher.publish(1, "f".repeat(64), source);
        double publicationMs = (System.nanoTime() - publicationStart) / 1_000_000.0;
        List<String> reports = new ArrayList<>();
        try (var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()) {
            for (int i = 0; i < 60; i++) {
                request(client, i);
            }
            for (int concurrency : new int[] {1, 8, 32}) {
                reports.add(measureStage(client, concurrency));
            }
        }
        Path output = Path.of("target/quality/capacity-baseline.json");
        Files.createDirectories(output.getParent());
        Files.writeString(
            output,
            String.format(
                Locale.ROOT,
                "{\"scope\":\"local single JVM and disposable PostgreSQL; public reads"
                    + " only\",\"sets\":1000,\"cards\":20000," + "\"availableProcessors\":%d,\"maxHeapBytes\":%d,"
                    + "\"publicationMs\":%.2f,\"stages\":[%s]}%n",
                Runtime.getRuntime().availableProcessors(),
                Runtime.getRuntime().maxMemory(),
                publicationMs,
                String.join(",", reports)));
    }

    private String measureStage(HttpClient client, int concurrency) throws Exception {
        try (var executor = Executors.newFixedThreadPool(concurrency)) {
            List<Callable<Double>> calls = IntStream.range(0, 600)
                .mapToObj(index -> (Callable<Double>) () -> request(client, index))
                .toList();
            final long start = System.nanoTime();
            var futures = executor.invokeAll(calls);
            double seconds = (System.nanoTime() - start) / 1_000_000_000.0;
            List<Double> samples = new ArrayList<>();
            for (var future : futures) {
                samples.add(future.get());
            }
            samples.sort(Double::compareTo);
            return String.format(
                Locale.ROOT,
                "{\"concurrency\":%d,\"requests\":600,\"errors\":0,\"requestsPerSecond\":%.2f,"
                    + "\"p50Ms\":%.2f,\"p95Ms\":%.2f,\"p99Ms\":%.2f}",
                concurrency,
                600 / seconds,
                percentile(samples, .50),
                percentile(samples, .95),
                percentile(samples, .99));
        }
    }

    private double request(HttpClient client, int index) throws Exception {
        String path = switch (index % 3) {
            case 0 -> "/api/v1/public-sets";
            case 1 -> "/api/v1/public-sets/synthetic-0";
            default -> "/api/v1/public-sets/synthetic-0/demo-cards";
        };
        final long start = System.nanoTime();
        var response = client.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isNotBlank();
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        if (index % 3 == 0) {
            assertThat(response.headers().firstValue("X-Next-Cursor")).isPresent();
        }
        return (System.nanoTime() - start) / 1_000_000.0;
    }

    private static double percentile(List<Double> samples, double fraction) {
        return samples.get((int) Math.ceil(samples.size() * fraction) - 1);
    }
}
