package com.revue.content.infrastructure.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import com.revue.content.domain.SetDefinition;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Runs the publishing rules on the real files in content/public, as packaged into the build, so a broken card fails CI
 * before it can be deployed (plan section 5).
 */
class PublicContentTests {

    @Test
    void thePublicSetDefinitionsFollowEveryRule() {
        List<SetDefinition> sets = PublicContent.readAndCheck();

        assertThat(sets).isNotEmpty();
    }

    @Test
    void thereIsMoreThanOneSetAndEveryOneCanRunTheFiveCardTrial() {
        // Visitors choose among the public sets, and each one offers the five-card trial (plan
        // sections 4 and 14). Revue publishes them, and no checker has approved them yet.
        List<SetDefinition> sets = PublicContent.readAndCheck();

        assertThat(sets).hasSizeGreaterThan(1);
        for (SetDefinition set : sets) {
            assertThat(set.publisher()).as(set.setKey()).isEqualTo("Revue");
            assertThat(set.cards()).as(set.setKey()).hasSizeGreaterThanOrEqualTo(5);
        }
    }

    @Test
    void theMissingSourceIsReportedAsUnavailableRatherThanEmpty() {
        // An empty source would retire every set, so the loader must never receive one.
        assertThatExceptionOfType(ContentUnavailableException.class)
                .isThrownBy(() -> PublicContent.readAndCheck("classpath*:content/does-not-exist/**/*.yaml"));
    }
}
