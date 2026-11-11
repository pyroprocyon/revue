package com.revue;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAnyPackage;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.type;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Dependency rules apply to every production class, including classes added later. */
class ArchitectureTests {

    private static final JavaClasses PRODUCTION = new ClassFileImporter()
        .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
        .importPackages("com.revue");

    @Test
    void domainsDependOnlyOnTheirOwnModelsAndTheJavaLibrary() {
        checkDomainDependencies(PRODUCTION);
    }

    static void checkDomainDependencies(JavaClasses importedClasses) {
        for (String context : contextsWithLayer(importedClasses, "domain")) {
            String domain = "com.revue." + context + ".domain..";
            classes().that()
                .resideInAPackage(domain)
                .should()
                .onlyDependOnClassesThat()
                .resideInAnyPackage("java..", domain, "org.jspecify.annotations..")
                .check(importedClasses);
        }
    }

    @Test
    void applicationUseCasesDoNotDependOnAdapters() {
        checkApplicationDependencies(PRODUCTION);
    }

    static void checkApplicationDependencies(JavaClasses importedClasses) {
        for (String context : contextsWithLayer(importedClasses, "application")) {
            String ownContext = "com.revue." + context;
            classes().that()
                .resideInAPackage(ownContext + ".application..")
                .should()
                .onlyDependOnClassesThat(
                    resideInAnyPackage(
                        "java..",
                        ownContext + ".application..",
                        ownContext + ".domain..",
                        "org.jspecify.annotations..").or(type(Service.class))
                        .or(type(Transactional.class))
                        .or(type(Propagation.class))
                        .or(type(Isolation.class)))
                .check(importedClasses);
        }
    }

    private static Set<String> contextsWithLayer(JavaClasses importedClasses, String layer) {
        Set<String> contexts = new TreeSet<>();
        for (JavaClass candidate : importedClasses.that(resideInAPackage("com.revue.*." + layer + ".."))) {
            contexts.add(candidate.getPackageName().split("\\.")[2]);
        }
        assertThat(contexts).as("contexts containing %s classes", layer).isNotEmpty();
        return contexts;
    }

    @Test
    void integrationLibrariesStayInsideTheirAdapters() {
        noClasses().that()
            .resideOutsideOfPackage("..infrastructure.persistence..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("jakarta.persistence..", "org.hibernate..", "org.springframework.data..")
            .check(PRODUCTION);
        noClasses().that()
            .resideOutsideOfPackage("..infrastructure.fsrs..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("io.github.openspacedrepetition..")
            .check(PRODUCTION);
        noClasses().that()
            .resideOutsideOfPackage("..infrastructure.files..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("org.yaml..")
            .check(PRODUCTION);
        classes().that()
            .areAnnotatedWith("org.springframework.web.bind.annotation.RestController")
            .should()
            .resideInAPackage("..presentation..")
            .check(PRODUCTION);
        checkAdapterDependencies(PRODUCTION);
    }

    static void checkAdapterDependencies(JavaClasses importedClasses) {
        noClasses().that()
            .resideInAPackage("..presentation..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("..domain..", "..infrastructure..")
            .check(importedClasses);
        noClasses().that()
            .resideOutsideOfPackage("..infrastructure..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework.security..",
                "org.springframework.session..",
                "org.springframework.mail..",
                "jakarta.mail..")
            .check(importedClasses);
        noClasses().that()
            .resideInAPackage("..infrastructure..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage("..presentation..")
            .check(importedClasses);
    }

    @Test
    void contextsDoNotReachIntoEachOther() {
        slices().matching("com.revue.(*)..").should().notDependOnEachOther().check(PRODUCTION);
    }
}
