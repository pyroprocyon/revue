package com.revue.content.infrastructure.files;

import com.revue.content.domain.ContentRules;
import com.revue.content.domain.InvalidContentException;
import com.revue.content.domain.SetDefinition;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;

/**
 * Reads the public set files that the build packages into the jar from {@code content/public} in the repo (see the
 * resources section of pom.xml), and checks them against {@link ContentRules}. Private content never lives here, so a
 * clone of the public repo holds only public sets.
 */
public final class PublicContent {

    static final String LOCATION = "classpath*:content/public/**/*.yaml";

    private static final String ROOT_MARKER = "content/public/";

    private PublicContent() {
    }

    /**
     * Returns every public set, parsed and checked.
     *
     * @throws ContentUnavailableException if no set file can be found or a file can't be read
     * @throws InvalidContentException if any file breaks a rule
     */
    public static List<SetDefinition> readAndCheck() {
        return readAndCheck(LOCATION);
    }

    /** Same as {@link #readAndCheck()}, from another location; tests use it. */
    static List<SetDefinition> readAndCheck(String location) {
        List<String> problems = new ArrayList<>();
        List<SetDefinition> sets = new ArrayList<>();
        int totalBytes = 0;
        for (Resource resource : findFiles(location)) {
            String name = nameOf(resource);
            String source = read(resource, name);
            totalBytes += source.getBytes(StandardCharsets.UTF_8).length;
            if (totalBytes > 16 * 1024 * 1024) {
                throw new ContentUnavailableException("Public source exceeds 16 MiB");
            }
            SetDefinition set = ContentParser.parse(name, source, problems);
            if (set != null) {
                sets.add(set);
            }
        }
        ContentRules.check(sets, problems);
        if (!problems.isEmpty()) {
            throw new InvalidContentException(problems);
        }
        return sets;
    }

    private static List<Resource> findFiles(String location) {
        ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver(
            PublicContent.class.getClassLoader());
        Resource[] resources;
        try {
            resources = resolver.getResources(location);
        } catch (IOException ex) {
            throw new ContentUnavailableException("Couldn't list the public content files", ex);
        }
        if (resources.length > 4096) {
            throw new ContentUnavailableException("Public source exceeds 4096 files");
        }
        if (resources.length == 0) {
            // An empty source would retire every set, so treat it as missing instead.
            throw new ContentUnavailableException("No public content files found at " + location);
        }
        return Arrays.stream(resources).sorted(Comparator.comparing(PublicContent::nameOf)).toList();
    }

    private static String read(Resource resource, String name) {
        try (var input = resource.getInputStream()) {
            byte[] bytes = input.readNBytes(1024 * 1024 + 1);
            if (bytes.length > 1024 * 1024) {
                throw new ContentUnavailableException(name + ": source exceeds 1 MiB");
            }
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new ContentUnavailableException("Couldn't read the public content file " + name, ex);
        }
    }

    /** The file's path below content/public, such as {@code starter/human-body-brain.yaml}. */
    private static String nameOf(Resource resource) {
        String description;
        try {
            description = resource.getURL().toString();
        } catch (IOException ex) {
            description = String.valueOf(resource.getFilename());
        }
        int root = description.lastIndexOf(ROOT_MARKER);
        return root < 0 ? description : description.substring(root + ROOT_MARKER.length());
    }
}
