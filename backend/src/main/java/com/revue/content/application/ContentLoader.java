package com.revue.content.application;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import com.revue.content.domain.ContentRules;
import com.revue.content.domain.InvalidContentException;
import com.revue.content.domain.PublishedSet;
import com.revue.content.domain.PublishedSetRepository;
import com.revue.content.domain.SetDefinition;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Synchronizes the complete publication source atomically, preserving keys and history. */
@Service
public class ContentLoader {
	private final PublishedSetRepository sets;
	private final Clock clock;

	public ContentLoader(PublishedSetRepository sets, Clock clock) {
		this.sets = sets;
		this.clock = clock;
	}

	public record Result(int setsAdded, int setsRetired, int setsRestored, int cardsAdded, int cardsChanged,
			int cardsRetired, int cardsRestored) {
		public boolean changedNothing() {
			return setsAdded + setsRetired + setsRestored + cardsAdded + cardsChanged + cardsRetired + cardsRestored == 0;
		}
	}

	@Transactional
	public Result load(List<SetDefinition> files) {
		List<String> problems = new ArrayList<>();
		ContentRules.check(files, problems);
		if (!problems.isEmpty()) {
			throw new InvalidContentException(problems);
		}
		PublishedSetRepository.Catalog catalog = sets.loadCatalog();
		List<PublishedSet> existing = catalog.existingSets();
		ContentRules.checkOwnership(files, existing);
		Map<String, PublishedSet> byKey = new HashMap<>();
		for (PublishedSet set : existing) {
			byKey.put(set.key(), set);
		}
		Set<String> incomingKeys = new HashSet<>();
		var now = clock.instant();
		int setsAdded = 0;
		int setsRetired = 0;
		int setsRestored = 0;
		int cardsAdded = 0;
		int cardsChanged = 0;
		int cardsRetired = 0;
		int cardsRestored = 0;
		List<PublishedSet> publications = new ArrayList<>();
		for (SetDefinition file : files) {
			incomingKeys.add(file.setKey());
			PublishedSet set = byKey.get(file.setKey());
			if (set == null) {
				set = PublishedSet.publish(file);
				setsAdded++;
				cardsAdded += set.cards().size();
			}
			else {
				PublishedSet.Changes changes = set.synchronize(file, now);
				if (changes.restored()) {
					setsRestored++;
				}
				cardsAdded += changes.cardsAdded();
				cardsChanged += changes.cardsChanged();
				cardsRetired += changes.cardsRetired();
				cardsRestored += changes.cardsRestored();
			}
			publications.add(set);
		}
		for (PublishedSet set : existing) {
			if (!incomingKeys.contains(set.key()) && set.retire(now)) {
				publications.add(set);
				setsRetired++;
			}
		}
		catalog.saveAll(publications);
		return new Result(setsAdded, setsRetired, setsRestored, cardsAdded, cardsChanged, cardsRetired, cardsRestored);
	}

}
