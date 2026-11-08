package com.revue.content.domain;

import java.util.List;

/** Publication writes use whole aggregates; there is no operation to delete shared content. */
public interface PublishedSetRepository {
	List<PublishedSet> findAll();
	void saveAll(List<PublishedSet> sets);
}
