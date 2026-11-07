package com.revue.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Runs the publishing rules on the real files in content/public, as packaged into the build, so a
 * broken card fails CI before it can be deployed (plan section 5).
 */
class PublicContentTests {

	@Test
	void thePublicSetFilesFollowEveryRule() {
		List<SetFile> sets = PublicContent.readAndCheck();

		assertThat(sets).isNotEmpty();
	}

	@Test
	void theStarterSetCanRunTheFiveCardTrial() {
		// The public preview and the trial need the Human Body & Brain set with at least five cards
		// (plan sections 4 and 14). Revue publishes it, and no checker has approved it yet.
		SetFile starter = PublicContent.readAndCheck()
			.stream()
			.filter(set -> set.setKey().equals("human-body-brain"))
			.findFirst()
			.orElseThrow();

		assertThat(starter.title()).isEqualTo("Human Body & Brain");
		assertThat(starter.publisher()).isEqualTo("Revue");
		assertThat(starter.cards()).hasSizeGreaterThanOrEqualTo(5);
	}

	@Test
	void aMissingSourceIsReportedAsUnavailableRatherThanEmpty() {
		// An empty source would retire every set, so the loader must never receive one.
		assertThatExceptionOfType(ContentUnavailableException.class)
			.isThrownBy(() -> PublicContent.readAndCheck("classpath*:content/does-not-exist/**/*.yaml"));
	}

}
