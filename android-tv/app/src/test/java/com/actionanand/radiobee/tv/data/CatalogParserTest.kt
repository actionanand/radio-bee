package com.actionanand.radiobee.tv.data

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

fun fixture(): String =
    CatalogParserTest::class.java.getResourceAsStream("/catalog-v2.json")!!.bufferedReader().use {
        it.readText()
    }

private const val BASE = "https://actionanand.github.io/radio-bee-data/v2/"

class CatalogParserTest {
    private val parser = CatalogParser(BASE)

    private fun rejects(change: (JSONObject) -> Unit) {
        val value = JSONObject(fixture())
        change(value)
        assertThrows(Exception::class.java) { parser.parse(value.toString()) }
    }

    @Test
    fun actualV2PreservesIdsStreamsAncestryAndFeaturedOrder() {
        val c = parser.parse(fixture())
        assertEquals(2, c.stations.size)
        assertEquals("Akashvani Nagercoil", c.byId.getValue("air-nagercoil").name)
        assertTrue(c.byId.getValue("air-nagercoil").streams.any { it.format == "hls" })
        assertTrue(
            c.byId.getValue("sooriyan-srilanka").streams.any { it.url.contains("sooriyanfmgarden") }
        )
        assertEquals(listOf("air-nagercoil", "sooriyan-srilanka"), c.featured)
    }

    @Test
    fun acceptsSparseGeographyWithoutInventingParents() {
        val value = JSONObject(fixture())
        val station = value.getJSONArray("stations").getJSONObject(1)
        station.put("regionId", JSONObject.NULL)
        station.put("districtId", JSONObject.NULL)
        station.put("localityId", JSONObject.NULL)
        assertEquals(2, parser.parse(value.toString()).stations.size)
    }

    @Test
    fun rejectsDuplicateStationIds() {
        rejects {
            val a = it.getJSONArray("stations")
            a.put(a.getJSONObject(0))
        }
    }

    @Test
    fun rejectsDuplicateStreamIds() {
        rejects {
            val a = it.getJSONArray("stations").getJSONObject(0).getJSONArray("streams")
            a.put(a.getJSONObject(0))
        }
    }

    @Test
    fun rejectsWrongCounts() {
        rejects { it.getJSONObject("manifest").getJSONObject("counts").put("streams", -1) }
    }

    @Test
    fun rejectsNonNumericCounts() {
        rejects { it.getJSONObject("manifest").getJSONObject("counts").put("stations", "2") }
    }

    @Test
    fun rejectsHttpWebsite() {
        rejects {
            it.getJSONArray("stations").getJSONObject(0).put("website", "http://example.com")
        }
    }

    @Test
    fun rejectsMissingPublication() {
        rejects { it.getJSONObject("manifest").remove("publishedOn") }
    }

    @Test
    fun rejectsEscapingManifestPaths() {
        rejects {
            it.getJSONObject("manifest").getJSONObject("files").put("stations", "../stations.json")
        }
    }

    @Test
    fun rejectsCycles() {
        rejects {
            val a = it.getJSONArray("locations")
            a.getJSONObject(0).put("parentId", a.getJSONObject(0).getString("id"))
        }
    }

    @Test
    fun rejectsConflictingNetworkCountry() {
        rejects { it.getJSONArray("stations").getJSONObject(0).put("countryCode", "LK") }
    }

    @Test
    fun rejectsUnknownProvenance() {
        rejects {
            it.getJSONArray("stations")
                .getJSONObject(0)
                .getJSONArray("streams")
                .getJSONObject(0)
                .put("sourceId", "missing")
        }
    }

    @Test
    fun rejectsUnsafeStreamUrls() {
        for (url in
            listOf(
                "http://example.com/live",
                "https://user:password@example.com/live",
                "javascript:alert(1)",
            )) rejects {
            it.getJSONArray("stations")
                .getJSONObject(0)
                .getJSONArray("streams")
                .getJSONObject(0)
                .put("url", url)
        }
    }

    @Test
    fun rejectsInvalidMigrations() {
        rejects {
            it.getJSONObject("stationMigrations")
                .getJSONArray("removed")
                .put(
                    JSONObject()
                        .put("oldId", "old")
                        .put("canonicalId", "missing")
                        .put("sourceId", JSONObject.NULL)
                        .put("reason", "test")
                )
        }
    }

    @Test
    fun malformedOptionalBrowseIndexDoesNotAffectCanonicalData() {
        val value = JSONObject(fixture()).put("browseIndex", "bad hint")
        assertEquals(2, parser.parse(value.toString()).stations.size)
    }

    @Test
    fun missingTranslationFallsBackToCanonicalEnglish() {
        val c = parser.parse(fixture())
        val station = c.stations.first()
        assertEquals(station.name, c.stationName(station, "missing"))
    }

    @Test
    fun searchRecognizesAliasesAndAllPublishedStationTranslations() {
        val c = parser.parse(fixture())
        val station = c.byId.getValue("air-nagercoil")
        assertTrue(c.search("Akashvani").contains(station))
        for (names in c.dictionaries.values) {
            names[station.id]?.let { assertTrue(c.search(it).contains(station)) }
        }
        assertTrue(c.search("", country = "LK").all { it.country == "LK" })
        assertTrue(c.search("", language = "ta").isNotEmpty())
    }

    @Test
    fun blankOrUnknownTranslationsFail() {
        rejects {
            it.getJSONObject("localization")
                .getJSONObject("ta")
                .put("stationNames", JSONObject().put("missing", "unknown"))
        }
        rejects {
            it.getJSONObject("localization")
                .getJSONObject("ta")
                .put("stationNames", JSONObject().put("air-nagercoil", " "))
        }
    }

    @Test
    fun unknownLanguageStationsRemainDiscoverableWithoutInventingTags() {
        val raw = JSONObject(fixture())
        val station = raw.getJSONArray("stations").getJSONObject(0)
        station.put("broadcastLanguages", org.json.JSONArray()).remove("languageProfile")
        val result = CatalogParser(BASE).parse(raw.toString())
        assertTrue(result.byId.getValue(station.getString("id")).languages.isEmpty())
        assertEquals(2, result.search("").size)
    }

    @Test
    fun countryRootsAreResolvedByMetadataRatherThanAssumedIds() {
        val raw = JSONObject(fixture())
        val locations = raw.getJSONArray("locations")
        for (i in 0 until locations.length()) {
            val location = locations.getJSONObject(i)
            if (location.getString("id") == "in") location.put("id", "india")
            if (location.optString("parentId") == "in") location.put("parentId", "india")
        }
        assertEquals(2, CatalogParser(BASE).parse(raw.toString()).stations.size)
    }
}

object CatalogProbe {
    @JvmStatic
    fun main(args: Array<String>) {
        val file = java.io.File(args.single())
        val c = CatalogParser(BASE).parse(file.readText())
        println(
            "Validated actual public catalogue ${c.version}: ${c.stations.size} stations, ${c.stations.sumOf{it.streams.size}} stream candidates, ${c.featured.size} featured; canonical names/URLs retained."
        )
    }
}
