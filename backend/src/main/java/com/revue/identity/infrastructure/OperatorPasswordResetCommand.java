package com.revue.identity.infrastructure;

import com.revue.identity.application.OperatorPasswordReset;
import java.io.Console;
import java.util.Arrays;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Reads recovery input from the operator's terminal and keeps it out of process arguments. */
@Component
@ConditionalOnProperty(name = "revue.account.reset-password", havingValue = "true")
class OperatorPasswordResetCommand implements ApplicationRunner {
    private static final Logger LOG = LoggerFactory.getLogger(OperatorPasswordResetCommand.class);

    private final OperatorPasswordReset passwordReset;

    OperatorPasswordResetCommand(OperatorPasswordReset passwordReset) {
        this.passwordReset = passwordReset;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        try (var _ = MDC.putCloseable("operation.id", UUID.randomUUID().toString())) {
            try {
                resetFromConsole();
            } catch (RuntimeException ex) {
                LOG.atError()
                    .addKeyValue("event.name", "account.password_reset")
                    .addKeyValue("event.outcome", "failure")
                    .addKeyValue("event.reason", ex.getClass().getSimpleName())
                    .log("Operator password reset did not finish successfully");
                throw ex;
            }
        }
    }

    private void resetFromConsole() {
        Console console = System.console();
        if (console == null) {
            throw new IllegalStateException("Password recovery requires an interactive terminal");
        }
        String username = console.readLine("Verified learner's username: ");
        if (username == null) {
            throw new IllegalStateException("Password recovery input ended");
        }
        String password = readPassword(console, "New password: ");
        if (!password.equals(readPassword(console, "Confirm new password: "))) {
            throw new IllegalArgumentException("The passwords do not match");
        }
        passwordReset.reset(username, password);
        console.printf("Password reset complete. Previous sessions are invalid.%n");
    }

    private static String readPassword(Console console, String prompt) {
        char[] input = console.readPassword("%s", prompt);
        if (input == null) {
            throw new IllegalStateException("Password recovery input ended");
        }
        try {
            return new String(input);
        } finally {
            Arrays.fill(input, '\0');
        }
    }
}
