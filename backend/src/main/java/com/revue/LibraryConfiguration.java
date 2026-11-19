package com.revue;

import com.revue.identity.application.AccountProblem;
import com.revue.identity.application.AccountService;
import com.revue.identity.application.AccountStudyDates;
import com.revue.identity.application.LoginCommit;
import com.revue.reviews.application.LearnerAccess;
import com.revue.reviews.application.LibraryProblem;
import com.revue.reviews.application.StudyDates;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
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
    LearnerAccess learnerAccess(HttpServletRequest request, LoginCommit login) {
        return new LearnerAccess() {
            @Override
            public UUID current() {
                return account().identity().accountId();
            }

            @Override
            public UUID lockCurrent() {
                var identity = account().identity();
                try {
                    return login.confirm(identity.accountId(), identity.credentialVersion()).accountId();
                } catch (AccountProblem _) {
                    throw new LibraryProblem(LibraryProblem.Kind.UNAUTHENTICATED);
                }
            }

            private AccountService.EligibleAccount account() {
                Object checked = request.getAttribute(AccountService.EligibleAccount.REQUEST_ATTRIBUTE);
                if (checked instanceof AccountService.EligibleAccount account) {
                    return account;
                }
                throw new LibraryProblem(LibraryProblem.Kind.UNAUTHENTICATED);
            }
        };
    }
}
