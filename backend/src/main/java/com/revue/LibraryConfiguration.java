package com.revue;

import com.revue.identity.application.AccountProblem;
import com.revue.identity.application.AccountSession;
import com.revue.identity.application.AccountStudyDates;
import com.revue.identity.application.LoginCommit;
import com.revue.reviews.application.LearnerAccess;
import com.revue.reviews.application.LibraryProblem;
import com.revue.reviews.application.StudyDates;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Composes the identity-owned eligibility check with the reviews-owned learner port. */
@Configuration(proxyBeanMethods = false)
public class LibraryConfiguration {
    @Bean
    StudyDates studyDates(AccountStudyDates dates) {
        return dates::recordStudyDay;
    }

    @Bean
    LearnerAccess learnerAccess(AccountSession session, LoginCommit login) {
        return () -> {
            var identity = session.current().orElseThrow(() -> new LibraryProblem(LibraryProblem.Kind.UNAUTHENTICATED));
            try {
                return login.confirm(identity.accountId(), identity.credentialVersion()).accountId();
            } catch (AccountProblem _) {
                throw new LibraryProblem(LibraryProblem.Kind.UNAUTHENTICATED);
            }
        };
    }
}
