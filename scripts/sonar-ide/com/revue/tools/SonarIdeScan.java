package com.revue.tools;

import com.google.gson.GsonBuilder;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.sonarsource.sonarlint.core.rpc.client.SloopLauncher;
import org.sonarsource.sonarlint.core.rpc.client.SonarLintRpcClientDelegate;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.analysis.AnalyzeFilesAndTrackParams;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.config.binding.BindingConfigurationDto;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.config.scope.ConfigurationScopeDto;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.config.scope.DidAddConfigurationScopesParams;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.initialize.BackendCapability;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.initialize.ClientConstantInfoDto;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.initialize.HttpConfigurationDto;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.initialize.InitializeParams;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.initialize.JsTsRequirementsDto;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.initialize.LanguageSpecificRequirements;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.initialize.TelemetryClientConstantAttributesDto;
import org.sonarsource.sonarlint.core.rpc.protocol.backend.log.LogLevel;
import org.sonarsource.sonarlint.core.rpc.protocol.client.analysis.RawIssueDto;
import org.sonarsource.sonarlint.core.rpc.protocol.client.log.LogParams;
import org.sonarsource.sonarlint.core.rpc.protocol.common.ClientFileDto;
import org.sonarsource.sonarlint.core.rpc.protocol.common.Language;

// The plugin's request-response API returns the complete list after the scan.
@SuppressWarnings("deprecation")
class SonarIdeScan {
    private static final String SCOPE = "revue";
    private static final String PROJECT_NAME = "Revue";
    private static final System.Logger LOG = System.getLogger(SonarIdeScan.class.getName());

    public static void main(String[] args) throws Exception {
        var root = Path.of("").toAbsolutePath();
        var plugin = Path.of(args[0]);
        var work = Path.of(args[1]);
        var node = Path.of(args[2]);
        var files = projectFiles(root, work.resolve("files"));
        var ready = new CompletableFuture<Void>();
        var client = client(root, files, ready);
        var javaHome = Path.of(System.getProperty("java.home"));
        var sloop = new SloopLauncher(client).start(plugin.resolve("sloop"), javaHome);
        try {
            var server = sloop.getRpcServer();
            var setup = configuration(plugin, work, node);
            server.initialize(setup).get(2, TimeUnit.MINUTES);
            var scope = new ConfigurationScopeDto(SCOPE, null, true, PROJECT_NAME,
                    new BindingConfigurationDto(null, null, true));
            var scopes = new DidAddConfigurationScopesParams(List.of(scope));
            server.getConfigurationService().didAddConfigurationScopes(scopes);
            ready.get(2, TimeUnit.MINUTES);
            var javaLibraries = Files.readString(work.resolve("classpath")).strip().replace(File.pathSeparator, ",");
            var properties = Map.of(
                    "sonar.java.source", "25",
                    "sonar.java.jdkHome", javaHome.toString(),
                    "sonar.java.binaries", root.resolve("backend/target/classes").toString(),
                    "sonar.java.test.binaries", root.resolve("backend/target/test-classes").toString(),
                    "sonar.java.libraries", javaLibraries,
                    "sonar.java.test.libraries", javaLibraries + "," + root.resolve("backend/target/classes"));
            var request = new AnalyzeFilesAndTrackParams(SCOPE, UUID.randomUUID(),
                    files.stream().map(ClientFileDto::getUri).toList(), properties, false);
            var result = server.getAnalysisService().analyzeFilesAndTrack(request).get(10, TimeUnit.MINUTES);
            if (!result.getFailedAnalysisFiles().isEmpty()) {
                throw new IOException("SonarQube for IDE could not analyze " + result.getFailedAnalysisFiles());
            }
            writeReport(root, work, setup, files, result.getRawIssues());
        } finally {
            sloop.shutdown().get(30, TimeUnit.SECONDS);
        }
    }

    private static InitializeParams configuration(Path plugin, Path work, Path node) throws IOException {
        var analyzers = plugin.resolve("plugins");
        Set<Path> jars;
        try (var entries = Files.list(analyzers)) {
            jars = entries.filter(path -> path.toString().endsWith(".jar")).collect(Collectors.toUnmodifiableSet());
        }
        var identity = new TelemetryClientConstantAttributesDto(SCOPE, PROJECT_NAME, "1", "CLI", Map.of());
        var jsRequirements = new JsTsRequirementsDto(node, analyzers.resolve("eslint-bridge"));
        return new InitializeParams(new ClientConstantInfoDto(PROJECT_NAME, "Revue SonarQube for IDE scan"),
                identity, HttpConfigurationDto.defaultConfig(), null, Set.of(BackendCapability.SECURITY_HOTSPOTS),
                work.resolve("storage"), work.resolve("engine"), jars, Map.of(),
                Set.of(Language.JAVA, Language.JS, Language.TS, Language.CSS, Language.PYTHON, Language.HTML,
                        Language.XML, Language.SECRETS, Language.TEXT, Language.DOCKER, Language.GITHUBACTIONS),
                Set.of(), Set.of(), List.of(), List.of(), work.resolve("home").toString(), Map.of(), false,
                new LanguageSpecificRequirements(jsRequirements, false), false, null, LogLevel.INFO);
    }

    private static List<ClientFileDto> projectFiles(Path root, Path inventory) throws IOException {
        var names = Files.readString(inventory, StandardCharsets.UTF_8);
        var files = Arrays.stream(names.split("\u0000")).filter(name -> !name.isEmpty()).distinct().sorted()
                .map(Path::of)
                .filter(path -> Files.isRegularFile(root.resolve(path), LinkOption.NOFOLLOW_LINKS))
                .map(path -> new ClientFileDto(root.resolve(path).toUri(), path, SCOPE, isTest(path),
                        "UTF-8", root.resolve(path), null, null, true)).toList();
        if (files.isEmpty()) {
            throw new IOException("No Revue files found");
        }
        return files;
    }

    private static boolean isTest(Path path) {
        var name = path.getFileName().toString();
        return path.startsWith("backend/src/test") || path.startsWith("frontend/src/test")
                || path.startsWith("frontend/e2e") || name.endsWith(".test.ts") || name.endsWith(".test.tsx")
                || (path.startsWith("scripts") && name.startsWith("test_") && name.endsWith(".py"));
    }

    private static SonarLintRpcClientDelegate client(
            Path root, List<ClientFileDto> files, CompletableFuture<Void> ready) {
        var type = SonarLintRpcClientDelegate.class;
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (proxy, method, args) -> {
            return switch (method.getName()) {
                case "getBaseDir" -> root;
                case "listFiles" -> files;
                case "getClientLiveDescription" -> "Revue command-line scan";
                case "didChangeAnalysisReadiness" -> {
                    if (Boolean.TRUE.equals(args[1]) && ((Set<?>) args[0]).contains(SCOPE)) {
                        ready.complete(null);
                    }
                    yield null;
                }
                case "log" -> {
                    var log = (LogParams) args[0];
                    LOG.log(System.Logger.Level.INFO, log.getMessage());
                    if (log.getStackTrace() != null) {
                        LOG.log(System.Logger.Level.WARNING, log.getStackTrace());
                    }
                    yield null;
                }
                default -> {
                    if (method.isDefault()) {
                        yield InvocationHandler.invokeDefault(proxy, method, args);
                    }
                    if (method.getReturnType() != void.class) {
                        throw new UnsupportedOperationException("Unexpected IDE callback: " + method.getName());
                    }
                    yield null;
                }
            };
        }));
    }

    private static void writeReport(Path root, Path work, InitializeParams setup, List<ClientFileDto> files,
                                    List<RawIssueDto> issues) throws IOException {
        var sorted = issues.stream().sorted(Comparator.comparing((RawIssueDto issue) -> issue.getFileUri().toString())
                .thenComparingInt(issue -> issue.getTextRange() == null ? 0 : issue.getTextRange().getStartLine())
                .thenComparing(RawIssueDto::getRuleKey)).toList();
        var paths = files.stream().map(file -> root.relativize(file.getFsPath()).toString()).toList();
        var analyzers = setup.getEmbeddedPluginPaths().stream()
                .map(path -> path.getFileName().toString()).sorted().toList();
        var report = Map.of("analyzedAt", Instant.now().toString(), "analyzers", analyzers, "inputFiles", paths,
                "issues", sorted);
        try (var writer = Files.newBufferedWriter(work.resolve("report.json"))) {
            new GsonBuilder().setPrettyPrinting().create().toJson(report, writer);
        }
    }
}
