package com.revue.content;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Makes the database match the checked set files, in one transaction (plan section 5).
 *
 * <ul>
 * <li>Sets and cards are found by their stable keys, never by file name or title.</li>
 * <li>Changing a card's text updates that one row and raises its content version, so the fix
 * reaches every saver. It never touches a student's schedule.</li>
 * <li>Card positions follow the file's order and are rewritten on every load.</li>
 * <li>A card missing from its set's file is retired; a set whose file is missing is retired at
 * the set level only, keeping its cards for existing savers. A returning key becomes active
 * again on the same row.</li>
 * <li>Nothing is ever deleted, and loading the same files twice changes nothing.</li>
 * </ul>
 *
 * <p>If any rule fails, the transaction rolls back and the database keeps its current content.
 */
@Service
class ContentLoader {

	private final SharedSetRepository sets;

	private final CardRepository cards;

	private final Clock clock;

	ContentLoader(SharedSetRepository sets, CardRepository cards, Clock clock) {
		this.sets = sets;
		this.cards = cards;
		this.clock = clock;
	}

	/** Counts of what one load changed, for the startup log. */
	record Result(int setsAdded, int setsRetired, int setsRestored, int cardsAdded, int cardsChanged,
			int cardsRetired, int cardsRestored) {

		boolean changedNothing() {
			return setsAdded + setsRetired + setsRestored + cardsAdded + cardsChanged + cardsRetired
					+ cardsRestored == 0;
		}

	}

	/**
	 * Loads the complete content source. Pass every set file at once: a set that isn't in
	 * {@code files} is retired.
	 * @throws InvalidContentException if the files break a rule, including a card key that belongs
	 * to another set
	 */
	@Transactional
	Result load(List<SetFile> files) {
		List<String> problems = new ArrayList<>();
		ContentRules.check(files, problems);
		if (!problems.isEmpty()) {
			throw new InvalidContentException(problems);
		}
		Instant now = clock.instant();
		Counter count = new Counter();

		Map<String, Card> existingCards = new HashMap<>();
		for (Card card : cards.findByContentKeyIn(allCardKeys(files))) {
			existingCards.put(card.contentKey(), card);
		}
		Set<String> loadedSetKeys = new HashSet<>();
		for (SetFile file : files) {
			loadedSetKeys.add(file.setKey());
			SharedSet set = sets.findBySetKey(file.setKey()).orElse(null);
			if (set == null) {
				set = sets.save(new SharedSet(file.setKey()));
				count.setsAdded++;
			}
			else if (set.restore()) {
				count.setsRestored++;
			}
			set.applyFrom(file);
			loadCards(set, file, existingCards, now, count, problems);
		}
		if (!problems.isEmpty()) {
			// Rolls back everything this load changed.
			throw new InvalidContentException(problems);
		}
		for (SharedSet set : sets.findAll()) {
			if (!loadedSetKeys.contains(set.setKey()) && set.retire(now)) {
				count.setsRetired++;
			}
		}
		return count.toResult();
	}

	private void loadCards(SharedSet set, SetFile file, Map<String, Card> existingCards, Instant now, Counter count,
			List<String> problems) {
		Set<String> keysInFile = new HashSet<>();
		for (int position = 0; position < file.cards().size(); position++) {
			CardFile cardFile = file.cards().get(position);
			keysInFile.add(cardFile.key());
			Card card = existingCards.get(cardFile.key());
			if (card == null) {
				card = new Card(set, cardFile.key());
				card.applyFrom(cardFile);
				card.moveTo(position);
				cards.save(card);
				count.cardsAdded++;
				continue;
			}
			if (!card.sharedSet().setKey().equals(set.setKey())) {
				problems.add(file.fileName() + ", card " + cardFile.key() + ": key belongs to set "
						+ card.sharedSet().setKey() + "; a card can't move between sets");
				continue;
			}
			if (card.restore()) {
				count.cardsRestored++;
			}
			if (card.applyFrom(cardFile)) {
				count.cardsChanged++;
			}
			card.moveTo(position);
		}
		if (set.id() == null) {
			return;
		}
		for (Card card : cards.findBySetOrdered(set)) {
			if (!keysInFile.contains(card.contentKey()) && card.retire(now)) {
				count.cardsRetired++;
			}
		}
	}

	private static Set<String> allCardKeys(List<SetFile> files) {
		Set<String> keys = new HashSet<>();
		for (SetFile file : files) {
			for (CardFile card : file.cards()) {
				keys.add(card.key());
			}
		}
		return keys;
	}

	private static final class Counter {

		int setsAdded;

		int setsRetired;

		int setsRestored;

		int cardsAdded;

		int cardsChanged;

		int cardsRetired;

		int cardsRestored;

		Result toResult() {
			return new Result(setsAdded, setsRetired, setsRestored, cardsAdded, cardsChanged, cardsRetired,
					cardsRestored);
		}

	}

}
