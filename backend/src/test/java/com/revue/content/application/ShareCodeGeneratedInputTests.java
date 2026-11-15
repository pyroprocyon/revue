package com.revue.content.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Locale;
import java.util.Optional;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** Checks share-code lookup over generated identifiers, with a fixed seed so a failure repeats. */
class ShareCodeGeneratedInputTests {
    private static final long SEED = 20261116L;
    private static final int RUNS = 500;

    @Test
    void everyCanonicalShareCodeLooksUpTheIdentifierItEncodes() {
        PublicSetQueries queries = mock(PublicSetQueries.class);
        when(queries.summaryById(anyLong())).thenReturn(Optional.empty());
        var service = new PublicSetService(queries);
        Random random = new Random(SEED);
        for (int run = 0; run < RUNS; run++) {
            long id = 1 + random.nextLong(Long.MAX_VALUE);

            service.summaryByShareCode(Long.toString(id, 36));

            verify(queries).summaryById(id);
        }
    }

    @Test
    void codesThatAreNotCanonicalNeverReachTheDatabase() {
        PublicSetQueries queries = mock(PublicSetQueries.class);
        var service = new PublicSetService(queries);
        Random random = new Random(SEED);
        for (int run = 0; run < RUNS; run++) {
            String code = Long.toString(1 + random.nextLong(Long.MAX_VALUE), 36);
            String uppercase = code.toUpperCase(Locale.ROOT);

            assertThat(service.summaryByShareCode("0" + code)).as("seed %d, run %d", SEED, run).isEmpty();
            assertThat(service.summaryByShareCode(code + "-")).as("seed %d, run %d", SEED, run).isEmpty();
            if (!uppercase.equals(code)) {
                assertThat(service.summaryByShareCode(uppercase)).as("seed %d, run %d", SEED, run).isEmpty();
            }
        }
        assertThat(service.summaryByShareCode("zzzzzzzzzzzzz")).isEmpty();
        verifyNoInteractions(queries);
    }
}
