package com.actionanand.radiobee.tv.data

import java.net.URI

data class Named(val id: String, val name: String)

data class Place(
    val id: String,
    val name: String,
    val country: String,
    val type: String,
    val parent: String?,
)

data class Network(
    val id: String,
    val name: String,
    val countries: Set<String>,
    val broadcasterId: String?,
    val artwork: String?,
)

data class Stream(
    val id: String,
    val url: String,
    val format: String,
    val verification: String,
    val rights: String,
    val directStatus: String?,
    val sourceId: String,
    val sourceKind: String = "",
)

data class Station(
    val id: String,
    val name: String,
    val networkId: String,
    val country: String,
    val regionId: String?,
    val districtId: String?,
    val localityId: String?,
    val languages: Set<String>,
    val genres: Set<String>,
    val themes: Set<String>,
    val aliases: List<String>,
    val streams: List<Stream>,
    val artwork: String?,
    val website: String?,
    val frequencyMHz: Double?,
    val about: String?,
    val discovery: Boolean,
)

data class Catalog(
    val version: String,
    val publishedOn: String,
    val stations: List<Station>,
    val networks: Map<String, Network>,
    val places: Map<String, Place>,
    val languages: List<Named>,
    val genres: List<Named>,
    val broadcasters: List<Named>,
    val themes: List<Named>,
    val featured: List<String>,
    val dictionaries: Map<String, Map<String, String>>,
) {
    val byId = stations.associateBy { it.id }

    fun stationName(station: Station, locale: String) =
        dictionaries[locale]?.get(station.id) ?: station.name

    fun artwork(station: Station): List<String> =
        listOfNotNull(station.artwork, networks[station.networkId]?.artwork).distinct()

    fun search(
        query: String,
        language: String = "",
        country: String = "",
        network: String = "",
        genre: String = "",
        broadcaster: String = "",
    ): List<Station> {
        val needle = query.trim().lowercase()
        return stations
            .filter { station ->
                (language.isEmpty() || language in station.languages) &&
                    (country.isEmpty() || country == station.country) &&
                    (network.isEmpty() || network == station.networkId) &&
                    (genre.isEmpty() || genre in station.genres) &&
                    (broadcaster.isEmpty() ||
                        broadcaster == networks[station.networkId]?.broadcasterId) &&
                    (needle.isEmpty() ||
                        (listOf(station.name, networks[station.networkId]?.name.orEmpty()) +
                                station.aliases +
                                dictionaries.values.mapNotNull { it[station.id] })
                            .any { it.lowercase().contains(needle) })
            }
            .sortedWith(compareBy<Station> { it.name.lowercase() }.thenBy { it.id })
    }

    fun devotional() = stations.filter { station ->
        val ids = station.genres + station.themes
        ids.any { id ->
            id in setOf("devotional", "religious", "spiritual") ||
                (genres + themes).any { it.id == id && it.name.lowercase().contains("devotional") }
        }
    }
}

fun validUrl(value: String, allowHttp: Boolean = false): Boolean = runCatching {
    val uri = URI(value)
    uri.scheme in (if (allowHttp) setOf("https", "http") else setOf("https")) &&
        !uri.host.isNullOrBlank() &&
        uri.rawUserInfo == null &&
        uri.rawFragment == null
}
    .getOrDefault(false)

data class PlaybackPolicy(
    val allowUnverified: Boolean = true,
    val checkVerification: Boolean = false,
    val checkRights: Boolean = false,
    val allowHttp: Boolean = false,
) {
    fun eligible(station: Station): List<Stream> =
        if (station.discovery) emptyList()
        else
            station.streams
                .filter { stream ->
                    stream.directStatus != "restricted" &&
                        validUrl(stream.url, allowHttp) &&
                        stream.format in setOf("mp3", "aac", "hls", "unknown") &&
                        !(stream.verification == "unverified" && !allowUnverified) &&
                        (!checkVerification ||
                            stream.verification == "verified" ||
                            (allowUnverified && stream.verification == "unverified")) &&
                        (!checkRights ||
                            (stream.rights == "permission-granted" &&
                                (stream.directStatus == null || stream.directStatus == "allowed")))
                }
                .sortedByDescending {
                    (if (it.verification == "verified") 100
                    else if (it.verification == "unavailable") -100 else 0) +
                        (if (it.sourceKind in setOf("official", "broadcaster")) 20 else 0)
                }
}
