package com.revue.content.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Random;
import org.junit.jupiter.api.Test;

/** Checks the cursor round trip over generated titles and identifiers, with a fixed seed so a failure repeats. */
class CatalogCursorGeneratedInputTests {
    private static final long SEED = 20261116L;
    private static final int RUNS = 500;
    private static final int[] TITLE_CODE_POINTS = {'a', 'Z', '9', ' ', '-', '_', '=', '/', '+', 'ñ', '字', 0x1F600};

    @Test
    void everyEncodedCursorParsesBackToTheSameTitleAndId() {
        Random random = new Random(SEED);
        for (int run = 0; run < RUNS; run++) {
            var cursor = new CatalogCursor(titleFrom(random), 1 + random.nextLong(Long.MAX_VALUE));

            assertThat(CatalogCursor.parse(cursor.encode())).as("seed %d, run %d", SEED, run).isEqualTo(cursor);
        }
    }

    private static String titleFrom(Random random) {
        var title = new StringBuilder();
        int length = random.nextInt(101);
        for (int index = 0; index < length; index++) {
            title.appendCodePoint(TITLE_CODE_POINTS[random.nextInt(TITLE_CODE_POINTS.length)]);
        }
        return title.toString();
    }
}
