package com.revue.tools;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.jar.JarFile;
import java.util.zip.ZipFile;

class VerifyPublicArtifact {
    public static void main(String[] args) throws IOException {
        Path dist = Path.of(args[0]);
        Path release = Path.of(args[1]);
        Set<String> expected = files(dist);
        Set<String> found = new HashSet<>();
        try (var jars = Files.walk(release)) {
            for (Path jar : jars.filter(p -> p.toString().endsWith(".jar")).toList()) {
                verifyJar(jar, jar.equals(release.resolve("app.jar")), dist, expected, found);
            }
        }
        if (!found.equals(expected)) {
            throw new IOException("Packaged public resources are incomplete");
        }
        System.getLogger(VerifyPublicArtifact.class.getName())
            .log(System.Logger.Level.INFO, "Verified {0} packaged public resources", found.size());
    }

    private static void verifyJar(Path jar, boolean application, Path dist, Set<String> expected, Set<String> found)
        throws IOException {
        try (var zip = new JarFile(jar.toFile(), true, ZipFile.OPEN_READ, Runtime.version())) {
            for (var entry : zip.versionedStream().filter(e -> !e.isDirectory()).toList()) {
                String path = entry.getName();
                if (path.startsWith("META-INF/resources/") || path.startsWith("public/") || path.startsWith("resources/")) {
                    throw new IOException("Unexpected public resource in " + jar.getFileName() + ": " + path);
                }
                if (!path.startsWith("static/")) {
                    continue;
                }
                String name = path.substring("static/".length());
                if (!application || !expected.contains(name) || !found.add(name)) {
                    throw new IOException("Unexpected packaged resource: " + path);
                }
                Path source = dist.resolve(name);
                try (var input = zip.getInputStream(entry)) {
                    if (entry.getSize() != Files.size(source)
                        || !Arrays.equals(input.readAllBytes(), Files.readAllBytes(source))) {
                        throw new IOException("Packaged bytes differ: " + path);
                    }
                }
            }
        }
    }

    private static Set<String> files(Path root) throws IOException {
        Set<String> names = new HashSet<>();
        try (var paths = Files.walk(root)) {
            for (Path path : paths.toList()) {
                if (Files.isSymbolicLink(path)) {
                    throw new IOException("Unexpected symbolic link: " + path);
                }
                if (Files.isRegularFile(path)) {
                    names.add(root.relativize(path).toString());
                }
            }
        }
        return names;
    }
}
