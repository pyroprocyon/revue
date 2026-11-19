package com.revue.content.infrastructure.files;

import static org.assertj.core.api.Assertions.assertThat;

import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.SetDefinition;
import java.util.List;
import org.junit.jupiter.api.Test;

class PublicationSourceTests {

    /**
     * The expected value is the digest the previous release computed for the same content, when cards still had key
     * ideas and these listed none. A different value would make the publisher reject the already published revision.
     */
    @Test
    void contentWithoutKeyIdeasKeepsTheDigestOfEarlierReleases() {
        var weather = new SetDefinition(
            "weather.yaml",
            "weather",
            "Weather",
            "Storm basics.",
            "Revue",
            "Science",
            List.of(
                new CardDefinition(
                    "typhoon-signal",
                    "What does Signal No. 1 warn of?",
                    "Strong winds within 36 hours",
                    null,
                    "One means a day and a half.",
                    "PAGASA")));
        var history = new SetDefinition(
            "history.yaml",
            "history",
            "History",
            "Key dates.",
            "Revue",
            "History",
            List.of(
                new CardDefinition(
                    "mactan",
                    "Who led the soldiers at Mactan?",
                    "Lapulapu",
                    "April 27, 1521.",
                    null,
                    "NHCP"),
                new CardDefinition("noli", "Who wrote Noli Me Tangere?", "José Rizal", null, null, "NHCP")));

        assertThat(PublicationSource.digest(List.of(weather, history)))
            .isEqualTo("da605963340edde9fab739554e7e9f4546011cb667dedf5f8d4faf7dcff09037");
    }
}
