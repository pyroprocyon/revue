package com.revue.content.infrastructure.files;

import com.revue.content.domain.SetDefinition;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import org.jspecify.annotations.Nullable;

final class PublicationSource {
    private PublicationSource() {
    }

    static String digest(List<SetDefinition> sets) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            sets.stream().sorted(Comparator.comparing(SetDefinition::setKey)).forEach(set -> {
                add(digest, set.setKey());
                add(digest, set.title());
                add(digest, set.description());
                add(digest, set.publisher());
                add(digest, set.subject());
                add(digest, Integer.toString(set.cards().size()));
                set.cards().forEach(card -> {
                    add(digest, card.key());
                    add(digest, card.question());
                    add(digest, card.answer());
                    add(digest, card.explanation());
                    add(digest, card.memoryHook());
                    add(digest, card.source());
                    add(digest, Integer.toString(card.keyIdeas().size()));
                    card.keyIdeas().forEach(idea -> add(digest, idea));
                });
            });
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    private static void add(MessageDigest digest, @Nullable String value) {
        byte[] bytes = value == null ? new byte[0] : value.getBytes(StandardCharsets.UTF_8);
        digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(value == null ? -1 : bytes.length).array());
        digest.update(bytes);
    }
}
