package com.revue;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Bootstraps the Revue application and its Spring-managed components. */
@SpringBootApplication
public class RevueApplication {

    /** Starts the HTTP application using the configured Spring environment. */
    public static void main(String[] args) {
        var context = SpringApplication.run(RevueApplication.class, args);
        if (Boolean.TRUE.equals(context.getEnvironment().getProperty("revue.content.publish", Boolean.class))) {
            SpringApplication.exit(context);
        }
    }
}
