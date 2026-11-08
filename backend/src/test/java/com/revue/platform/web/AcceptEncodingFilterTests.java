package com.revue.platform.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * Which compression formats a client's Accept-Encoding header accepts (RFC 9110, section 12.5.3).
 * A weight of zero rejects a format, and {@code *} covers the formats the header doesn't name. The
 * HTTP behavior is tested in StaticServingTests.
 */
class AcceptEncodingFilterTests {

	@ParameterizedTest(name = "\"{0}\" accepts \"{1}\"")
	@CsvSource(delimiter = '|', nullValues = "none", textBlock = """
			br, gzip                  | br, gzip
			gzip, deflate, br, zstd   | gzip, br
			gzip;q=0, identity        | none
			br;q=0, gzip              | gzip
			br;q=0, gzip;q=0.000      | none
			br; q=0.001, gzip         | br, gzip
			GZIP;Q=0.5                | gzip
			x-gzip                    | gzip
			gzip;q=not-a-number       | none
			identity                  | none
			*                         | br, gzip
			*;q=1, identity;q=0       | br, gzip
			gzip;q=0, *               | br
			gzip, *;q=0.5             | gzip, br
			*;q=0, br                 | br
			identity;q=0, *;q=0       | none
			;                         | none
			gzip,;                    | gzip
			''                        | none
			""")
	void acceptsOnlyServedFormatsWithAPositiveWeight(String header, String expected) {
		assertThat(AcceptEncodingFilter.acceptedCodings(header)).isEqualTo(expected);
	}

}
