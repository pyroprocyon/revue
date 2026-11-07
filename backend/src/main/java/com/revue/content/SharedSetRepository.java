package com.revue.content;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface SharedSetRepository extends JpaRepository<SharedSet, Long> {

	Optional<SharedSet> findBySetKey(String setKey);

}
