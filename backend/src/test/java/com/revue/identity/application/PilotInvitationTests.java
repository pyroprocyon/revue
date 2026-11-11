package com.revue.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class PilotInvitationTests {
    @Test
    void independentEnvironmentsAcceptTheSameCode() {
        var local = new PilotInvitation("TestCode");
        var hosted = new PilotInvitation("TestCode");
        var submitted = PilotInvitation.hash("TestCode");
        assertThat(local.accepts(submitted)).isTrue();
        assertThat(hosted.accepts(submitted)).isTrue();
    }

    @Test
    void changingTheSettingRejectsTheOldCode() {
        var replacement = new PilotInvitation("NewCode1");
        assertThat(replacement.accepts(PilotInvitation.hash("TestCode"))).isFalse();
        assertThat(replacement.accepts(PilotInvitation.hash("NewCode1"))).isTrue();
    }

    @Test
    void missingSettingDoesNotAcceptArbitraryInvitations() {
        var missing = new PilotInvitation("");
        assertThat(missing.isConfigured()).isFalse();
        assertThat(missing.accepts(PilotInvitation.hash("TestCode"))).isFalse();
    }

    @Test
    void invalidConfigurationFailsWithoutExposingItsValue() {
        assertThatThrownBy(() -> new PilotInvitation("invalid-private-code!"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageNotContaining("invalid-private-code");
    }
}
