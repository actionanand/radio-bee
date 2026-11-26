package com.actionanand.radiobee.tv.data

import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

private class MemoryCache(var snapshot: String? = null) : CatalogCache {
    var writes = 0

    override fun read() = snapshot

    override fun write(snapshot: String) {
        this.snapshot = snapshot
        writes++
    }

    override fun clear() {
        snapshot = null
    }
}

class CatalogRepositoryTest {
    private val base = "https://actionanand.github.io/radio-bee-data/v2/"

    private fun transport(raw: JSONObject, broken: () -> Boolean = { false }) =
        CatalogFetch { url ->
            if (broken()) error("offline")
            val relative = url.removePrefix(base)
            when {
                relative == "index.json" -> raw.getJSONObject("manifest").toString()
                relative == "home-stations.json" -> raw.getJSONObject("home").toString()
                relative.startsWith("i18n/") ->
                    raw.getJSONObject("localization")
                        .getJSONObject(relative.substringAfter('/').substringBefore('.'))
                        .toString()
                else -> {
                    val files = raw.getJSONObject("manifest").getJSONObject("files")
                    val key = files.keys().asSequence().single { files.getString(it) == relative }
                    raw.get(key).toString()
                }
            }
        }

    @Test
    fun validatesBeforeReplacingCache() = runTest {
        val raw = JSONObject(fixture())
        val cache = MemoryCache()
        val repo = CatalogRepository(base, CatalogParser(base), transport(raw), cache)
        repo.start()
        assertEquals(2, repo.state.value.catalog!!.stations.size)
        assertEquals(1, cache.writes)
    }

    @Test
    fun offlineRefreshRetainsThePreviousSnapshotAndCache() = runTest {
        var offline = false
        val cache = MemoryCache(fixture())
        val repo =
            CatalogRepository(
                base,
                CatalogParser(base),
                transport(JSONObject(fixture())) { offline },
                cache,
            )
        repo.start()
        val previous = cache.snapshot
        offline = true
        repo.refresh()
        assertEquals(previous, cache.snapshot)
        assertEquals(2, repo.state.value.catalog!!.stations.size)
        assertTrue(repo.state.value.error)
    }

    @Test
    fun malformedRefreshCannotReplaceLastKnownGood() = runTest {
        val raw = JSONObject(fixture())
        val cache = MemoryCache(fixture())
        val repo = CatalogRepository(base, CatalogParser(base), transport(raw), cache)
        repo.start()
        val previous = cache.snapshot
        raw.getJSONObject("manifest").getJSONObject("counts").put("stations", 99)
        repo.refresh()
        assertEquals(previous, cache.snapshot)
        assertEquals(2, repo.state.value.catalog!!.stations.size)
    }

    @Test
    fun corruptedCacheAndOfflineNetworkFailGracefully() = runTest {
        val repo =
            CatalogRepository(
                base,
                CatalogParser(base),
                CatalogFetch { error("offline") },
                MemoryCache("bad json"),
            )
        repo.start()
        assertNull(repo.state.value.catalog)
        assertTrue(repo.state.value.error)
        assertFalse(repo.state.value.loading)
    }

    @Test
    fun clearCacheKeepsLoadedCanonicalData() = runTest {
        val cache = MemoryCache()
        val repo =
            CatalogRepository(base, CatalogParser(base), transport(JSONObject(fixture())), cache)
        repo.start()
        repo.clearCache()
        assertNull(cache.snapshot)
        assertEquals(2, repo.state.value.catalog!!.stations.size)
    }

    @Test
    fun unavailableOptionalBrowseIndexDoesNotBlockCanonicalCatalogue() = runTest {
        val raw = JSONObject(fixture())
        raw.getJSONObject("manifest").getJSONObject("files").put("browseIndex", "browse-index.json")
        val delegate = transport(raw)
        val fetch = CatalogFetch { url ->
            check(!url.endsWith("browse-index.json"))
            delegate.get(url)
        }
        val repo = CatalogRepository(base, CatalogParser(base), fetch, MemoryCache())
        repo.start()
        assertFalse(repo.state.value.error)
        assertEquals(2, repo.state.value.catalog!!.stations.size)
    }
}
