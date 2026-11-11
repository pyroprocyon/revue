package com.revue.content.application;

import com.revue.content.domain.CardDefinition;
import com.revue.content.domain.ContentRules;
import com.revue.content.domain.InvalidContentException;
import com.revue.content.domain.PublishedSet;
import com.revue.content.domain.PublishedSetRepository;
import com.revue.content.domain.SetDefinition;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Synchronizes the complete publication source atomically, preserving keys and history. */
@Service
public class ContentLoader {
    private final PublishedSetRepository sets;
    private final Clock clock;

    /** Creates the content loader with its publication store and retirement clock. */
    public ContentLoader(PublishedSetRepository sets, Clock clock) {
        this.sets = sets;
        this.clock = clock;
    }

    /** Counts the set and card changes made during a content import. */
    public record Result(
        int setsAdded,
        int setsRetired,
        int setsRestored,
        int cardsAdded,
        int cardsChanged,
        int cardsRetired,
        int cardsRestored) {
        /** Reports whether the import left all existing content unchanged. */
        public boolean changedNothing() {
            return setsAdded + setsRetired + setsRestored + cardsAdded + cardsChanged + cardsRetired
                + cardsRestored == 0;
        }
    }

    /** Validates and reconciles the complete supplied catalog in one transaction. */
    @Transactional
    public Result load(List<SetDefinition> files) {
        List<String> problems = new ArrayList<>();
        if (files.isEmpty() || files.size() > 4096) {
            throw new InvalidContentException(List.of("Publication requires between 1 and 4096 set definitions"));
        }
        ContentRules.check(files, problems);
        if (!problems.isEmpty()) {
            throw new InvalidContentException(problems);
        }
        Set<String> incomingKeys = new HashSet<>();
        var now = clock.instant();
        int setsAdded = 0;
        int setsRestored = 0;
        int cardsAdded = 0;
        int cardsChanged = 0;
        int cardsRetired = 0;
        int cardsRestored = 0;
        for (SetDefinition file : files) {
            incomingKeys.add(file.setKey());
            ContentRules
                .checkOwnership(List.of(file), sets.ownersOf(file.cards().stream().map(CardDefinition::key).toList()));
            PublishedSetRepository.LoadedSet loaded = sets.loadSet(file.setKey());
            PublishedSet set = loaded.existing().orElse(null);
            if (set == null) {
                set = PublishedSet.publish(file);
                setsAdded++;
                cardsAdded += set.cards().size();
            } else {
                PublishedSet.Changes changes = set.synchronize(file, now);
                if (changes.restored()) {
                    setsRestored++;
                }
                cardsAdded += changes.cardsAdded();
                cardsChanged += changes.cardsChanged();
                cardsRetired += changes.cardsRetired();
                cardsRestored += changes.cardsRestored();
            }
            loaded.save(set);
        }
        int setsRetired = sets.retireMissing(incomingKeys, now);
        return new Result(setsAdded, setsRetired, setsRestored, cardsAdded, cardsChanged, cardsRetired, cardsRestored);
    }
}
