package com.revue;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

/** Dependency rules apply to every production class, including classes added later. */
class ArchitectureTests {

	private static final JavaClasses PRODUCTION = new ClassFileImporter()
		.withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages("com.revue");

	@Test
	void domainsDependOnlyOnTheirOwnModelsAndTheJavaLibrary() {
		for (String context : new String[]{"content", "reviews"}) {
			String domain = "com.revue." + context + ".domain..";
			classes().that().resideInAPackage(domain).should().onlyDependOnClassesThat()
				.resideInAnyPackage("java..", domain, "org.jspecify.annotations..").check(PRODUCTION);
		}
	}

	@Test
	void applicationUseCasesDoNotDependOnAdapters() {
		classes().that().resideInAPackage("..application..").should().onlyDependOnClassesThat()
			.resideInAnyPackage("java..", "com.revue.content.application..", "com.revue.content.domain..",
				"org.springframework.stereotype..", "org.springframework.transaction.annotation..",
				"org.jspecify.annotations..").check(PRODUCTION);
	}

	@Test
	void integrationLibrariesStayInsideTheirAdapters() {
		noClasses().that().resideOutsideOfPackage("..infrastructure.persistence..").should()
			.dependOnClassesThat().resideInAnyPackage("jakarta.persistence..", "org.hibernate..", "org.springframework.data..")
			.check(PRODUCTION);
		noClasses().that().resideOutsideOfPackage("..infrastructure.fsrs..").should()
			.dependOnClassesThat().resideInAPackage("io.github.openspacedrepetition..").check(PRODUCTION);
		noClasses().that().resideOutsideOfPackage("..infrastructure.files..").should()
			.dependOnClassesThat().resideInAPackage("org.yaml..").check(PRODUCTION);
		classes().that().areAnnotatedWith("org.springframework.web.bind.annotation.RestController")
			.should().resideInAPackage("..presentation..").check(PRODUCTION);
		noClasses().that().resideInAPackage("..presentation..").should()
			.dependOnClassesThat().resideInAnyPackage("..domain..", "..infrastructure..").check(PRODUCTION);
	}

	@Test
	void contextsDoNotReachIntoEachOther() {
		slices().matching("com.revue.(*)..").should().notDependOnEachOther().check(PRODUCTION);
	}
}
