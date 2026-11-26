package com.actionanand.radiobee.tv.data

import java.net.URI
import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject

/** V2 is parsed independently of V1: additional metadata and sparse ancestry are intentional. */
class CatalogParser(private val base: String, private val allowHttpStreams: Boolean = false) {
    companion object {
        const val MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024
    }

    private fun text(row: JSONObject, key: String): String =
        (row.get(key) as? String)?.takeIf { it.isNotBlank() } ?: error("Missing text: $key")

    private fun optional(row: JSONObject, key: String): String? =
        if (!row.has(key) || row.isNull(key)) null else text(row, key)

    private fun strings(row: JSONObject, key: String, required: Boolean = true): List<String> {
        if (!row.has(key) && !required) return emptyList()
        val array = row.getJSONArray(key)
        val values =
            (0 until array.length()).map {
                (array.get(it) as? String)?.takeIf(String::isNotBlank) ?: error("Invalid $key")
            }
        require(values.distinct().size == values.size) { "Duplicate $key" }
        return values
    }

    private fun table(
        raw: JSONObject,
        key: String,
        identity: String = "id",
        optional: Boolean = false,
    ): List<JSONObject> {
        val array = if (optional && !raw.has(key)) JSONArray() else raw.getJSONArray(key)
        return (0 until array.length())
            .map { array.getJSONObject(it) }
            .also { rows ->
                val ids = rows.map { text(it, identity) }
                require(ids.distinct().size == ids.size) { "Duplicate $key identity" }
                require(
                    ids.all {
                        if (identity == "code") it.matches(Regex("[a-z]{2,3}"))
                        else it.matches(Regex("[a-z0-9]+(?:-[a-z0-9]+)*"))
                    }
                ) {
                    "Invalid $key identity"
                }
            }
    }

    private fun website(row: JSONObject, key: String): String? =
        optional(row, key)?.also { require(validUrl(it)) { "Unsafe $key" } }

    private fun asset(row: JSONObject): String? =
        website(row, "logoUrl") ?: optional(row, "logoPath")?.let { relative(it) }

    private fun integer(row: JSONObject, key: String): Int {
        val value = row.get(key)
        require(
            value is Number &&
                value.toDouble().isFinite() &&
                value.toDouble() == value.toInt().toDouble()
        ) {
            "Invalid integer: $key"
        }
        return value.toInt()
    }

    fun relative(file: String): String {
        require(
            file.isNotBlank() &&
                !file.contains('\\') &&
                !file.startsWith('/') &&
                !file.contains('?') &&
                !file.contains('#')
        )
        require(!URI(file).isAbsolute && URI(file).path.split('/').none { it == ".." })
        val uri = URI(base).resolve(file)
        require(
            validUrl(uri.toString()) &&
                uri.host == URI(base).host &&
                uri.path.startsWith(URI(base).path)
        ) {
            "Path outside catalogue"
        }
        return uri.toString()
    }

    fun parse(snapshot: String): Catalog {
        require(snapshot.toByteArray().size <= MAX_SNAPSHOT_BYTES) { "Catalogue too large" }
        val raw = JSONObject(snapshot)
        val manifest = raw.getJSONObject("manifest")
        require(integer(manifest, "schemaVersion") == 2) { "Expected catalogue V2" }
        val version = text(manifest, "catalogVersion")
        require(version.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+")))
        val published = text(manifest, "publishedOn").also { LocalDate.parse(it) }
        require(text(manifest, "defaultLocale") == "en")
        val locales = strings(manifest, "locales")
        require(locales.containsAll(listOf("en", "ta", "sa")))
        val countries = strings(manifest, "countries").toSet()
        require(countries.all { it.matches(Regex("[A-Z]{2}")) })
        val files = manifest.getJSONObject("files")
        val filenames =
            mapOf(
                "networks" to "networks.json",
                "stations" to "stations.json",
                "locations" to "locations.json",
                "languages" to "languages.json",
                "categories" to "categories.json",
                "sources" to "sources.json",
                "discoveryStations" to "discovery-stations.json",
                "stationMigrations" to "station-migrations.json",
                "broadcasters" to "broadcasters.json",
                "programmeThemes" to "programme-themes.json",
                "artists" to "artists.json",
                "browseIndex" to "browse-index.json",
            )
        for (key in
            listOf(
                "networks",
                "stations",
                "locations",
                "languages",
                "categories",
                "sources",
            )) require(files.has(key))
        for (key in files.keys()) {
            require(key == "browseIndex" || raw.has(key)) { "Missing advertised table" }
            require(filenames[key] == files.getString(key)) {
                "Unexpected manifest reference: $key"
            }
            relative(files.getString(key))
        }
        require(text(manifest, "localizationRoot") == "i18n/")
        val sources = table(raw, "sources").associateBy { it.getString("id") }
        sources.values.forEach {
            text(it, "title")
            text(it, "kind")
            website(it, "url")
        }
        fun sourceRefs(row: JSONObject, key: String, required: Boolean = true) {
            require(strings(row, key, required).all { sources.containsKey(it) }) {
                "Unknown source"
            }
        }
        val broadcasters =
            table(raw, "broadcasters", optional = true).map {
                sourceRefs(it, "sourceIds")
                website(it, "website")
                Named(text(it, "id"), text(it, "name"))
            }
        val artists =
            table(raw, "artists", optional = true).map { Named(text(it, "id"), text(it, "name")) }
        val themes =
            table(raw, "programmeThemes", optional = true).map {
                Named(text(it, "id"), text(it, "name"))
            }
        val languages =
            table(raw, "languages", "code").map { Named(text(it, "code"), text(it, "name")) }
        val genres = table(raw, "categories").map { Named(text(it, "id"), text(it, "name")) }
        val networks =
            table(raw, "networks")
                .map { row ->
                    sourceRefs(row, "broadcasterSourceIds", false)
                    website(row, "website")
                    val broadcaster = optional(row, "broadcasterId")
                    require(broadcaster == null || broadcasters.any { it.id == broadcaster })
                    Network(
                        text(row, "id"),
                        text(row, "name"),
                        strings(row, "countryCodes").toSet(),
                        broadcaster,
                        asset(row),
                    )
                }
                .associateBy { it.id }
        val places =
            table(raw, "locations")
                .map { row ->
                    val type = text(row, "type")
                    require(type in listOf("country", "state", "district", "locality"))
                    Place(
                        text(row, "id"),
                        text(row, "name"),
                        text(row, "countryCode"),
                        type,
                        optional(row, "parentId"),
                    )
                }
                .associateBy { it.id }
        val ranks = mapOf("country" to 0, "state" to 1, "district" to 2, "locality" to 3)
        fun ancestry(id: String): List<Place> {
            val chain = mutableListOf<Place>()
            val seen = mutableSetOf<String>()
            var current: String? = id
            while (current != null) {
                require(seen.add(current)) { "Location cycle" }
                val place = places[current] ?: error("Unknown location")
                chain.add(0, place)
                current = place.parent
            }
            require(chain.first().type == "country")
            require(chain.all { it.country == chain.first().country })
            require(
                chain.zipWithNext().all { (a, b) ->
                    ranks.getValue(a.type) < ranks.getValue(b.type)
                }
            )
            return chain
        }
        places.keys.forEach { ancestry(it) }
        val streamIds = mutableSetOf<String>()
        fun station(row: JSONObject, discovery: Boolean): Station {
            val id = text(row, "id")
            val country = text(row, "countryCode")
            val network = text(row, "networkId")
            require(
                country in countries && networks[network]?.countries?.contains(country) == true
            ) {
                "Network/country conflict"
            }
            sourceRefs(row, "sourceIds")
            require(row.getJSONArray("sourceIds").length() > 0)
            val languageCodes = strings(row, "broadcastLanguages").toSet()
            require(languageCodes.all { l -> languages.any { it.id == l } })
            val genreIds = strings(row, "genres").toSet()
            require(genreIds.all { g -> genres.any { it.id == g } })
            val themeIds = strings(row, "programmeThemeIds", false).toSet()
            require(themeIds.all { t -> themes.any { it.id == t } })
            require(strings(row, "artistIds", false).all { a -> artists.any { it.id == a } })
            row.optJSONObject("languageProfile")?.let { profile ->
                require(
                    text(profile, "classification") in
                        listOf("single-language", "multilingual", "unknown")
                )
                optional(profile, "primaryLanguage")?.let { require(it in languageCodes) }
            }
            val region = optional(row, "regionId")
            val district = optional(row, "districtId")
            val locality = optional(row, "localityId")
            val countryRoot =
                places.values.singleOrNull { it.type == "country" && it.country == country }
                    ?: error("Missing country root")
            val chain = ancestry(locality ?: district ?: region ?: countryRoot.id)
            require(chain.all { it.country == country })
            for ((value, type) in
                listOf(region to "state", district to "district", locality to "locality")) require(
                value == null || chain.any { it.id == value && it.type == type }
            )
            val streams =
                if (discovery) {
                    require(!row.has("streams") || row.getJSONArray("streams").length() == 0)
                    emptyList()
                } else {
                    val array = row.getJSONArray("streams")
                    require(array.length() > 0) { "Stream-bearing collection requires candidates" }
                    (0 until array.length()).map { index ->
                        val stream = array.getJSONObject(index)
                        val streamId = text(stream, "id")
                        require(
                            streamId.matches(Regex("[a-z0-9]+(?:-[a-z0-9]+)*")) &&
                                streamIds.add(streamId)
                        ) {
                            "Duplicate stream ID"
                        }
                        val url = text(stream, "url")
                        require(validUrl(url, allowHttpStreams)) { "Invalid stream URL" }
                        val format = text(stream, "format")
                        require(format in listOf("mp3", "aac", "hls", "ogg", "unknown"))
                        val verification = text(stream, "verificationStatus")
                        require(verification in listOf("verified", "unverified", "unavailable"))
                        val rights = text(stream, "rightsStatus")
                        require(rights in listOf("permission-granted", "unconfirmed", "prohibited"))
                        optional(stream, "lastVerifiedAt")?.let { java.time.Instant.parse(it) }
                        val sourceId = text(stream, "sourceId")
                        require(sources.containsKey(sourceId))
                        val direct = stream.optJSONObject("directListening")
                        val status = direct?.let { text(it, "status") }
                        require(
                            status == null ||
                                status in listOf("needs-review", "restricted", "allowed")
                        )
                        direct?.let {
                            require(sources.containsKey(text(it, "sourceId")))
                            java.time.Instant.parse(text(it, "reviewedAt"))
                            require(
                                text(it, "recording") in
                                    listOf("unconfirmed", "prohibited", "permission-granted")
                            )
                            require(
                                text(it, "redistribution") in
                                    listOf("unconfirmed", "prohibited", "permission-granted")
                            )
                        }
                        Stream(
                            streamId,
                            url,
                            format,
                            verification,
                            rights,
                            status,
                            sourceId,
                            sources.getValue(sourceId).getString("kind"),
                        )
                    }
                }
            val frequency =
                if (row.isNull("frequencyMHz") || !row.has("frequencyMHz")) null
                else row.getDouble("frequencyMHz").also { require(it.isFinite() && it > 0) }
            return Station(
                id,
                text(row, "name"),
                network,
                country,
                region,
                district,
                locality,
                languageCodes,
                genreIds,
                themeIds,
                strings(row, "aliases", false),
                streams,
                asset(row),
                website(row, "website"),
                frequency,
                optional(row, "notes"),
                discovery,
            )
        }
        val streamed = table(raw, "stations").map { station(it, false) }
        val discovery = table(raw, "discoveryStations", optional = true).map { station(it, true) }
        val stations = streamed + discovery
        require(stations.map { it.id }.distinct().size == stations.size) {
            "Duplicate station identity"
        }
        val counts = manifest.getJSONObject("counts")
        fun count(key: String, expected: Int, required: Boolean = true) {
            if (required || counts.has(key)) {
                val value = counts.get(key)
                require(value is Number && value.toDouble() == expected.toDouble()) {
                    "Incorrect count: $key"
                }
            }
        }
        count("stations", streamed.size)
        count("networks", networks.size)
        count("locations", places.size)
        count("streams", streamIds.size)
        count(
            "verifiedStreams",
            streamed.sumOf { s -> s.streams.count { it.verification == "verified" } },
        )
        count("discoveryStations", discovery.size, false)
        count("discoverableStations", stations.size, false)
        count("stationsWithStreamCandidates", streamed.size, false)
        count(
            "productionEligibleStations",
            streamed.count { s ->
                s.streams.any {
                    it.verification == "verified" &&
                        it.rights == "permission-granted" &&
                        (it.directStatus == null || it.directStatus == "allowed")
                }
            },
            false,
        )
        raw.optJSONObject("stationMigrations")?.let { migration ->
            require(integer(migration, "schemaVersion") == 1)
            val rows = migration.getJSONArray("removed")
            val seen = mutableSetOf<String>()
            for (i in 0 until rows.length()) {
                val row = rows.getJSONObject(i)
                val old = text(row, "oldId")
                require(seen.add(old) && stations.none { it.id == old })
                optional(row, "canonicalId")?.let { target ->
                    require(stations.any { it.id == target })
                }
                optional(row, "sourceId")?.let { require(sources.containsKey(it)) }
                text(row, "reason")
            }
        }
        val dictionaries = mutableMapOf<String, Map<String, String>>()
        val localization = raw.getJSONObject("localization")
        for (locale in listOf("en", "ta", "sa")) {
            val names =
                localization.getJSONObject(locale).optJSONObject("stationNames") ?: JSONObject()
            dictionaries[locale] =
                names.keys().asSequence().associateWith { key ->
                    require(stations.any { it.id == key })
                    text(names, key)
                }
        }
        val home = raw.optJSONObject("home")
        val featured = runCatching {
            require(home != null && integer(home, "schemaVersion") == 2)
            val ids = strings(home, "stationIds")
            require(
                integer(home, "count") == ids.size && ids.all { id -> stations.any { it.id == id } }
            )
            ids
        }
            .getOrDefault(emptyList())
        return Catalog(
            version,
            published,
            stations,
            networks,
            places,
            languages,
            genres,
            broadcasters,
            themes,
            featured,
            dictionaries,
        )
    }
}
