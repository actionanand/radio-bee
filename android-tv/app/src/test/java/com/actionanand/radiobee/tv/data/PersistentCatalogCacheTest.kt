package com.actionanand.radiobee.tv.data

import java.io.File
import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

private class DiskSnapshot(private val file: File) : CatalogCache {
    override fun read() = if (file.exists()) file.readText() else null

    override fun write(snapshot: String) {
        file.parentFile!!.mkdirs()
        file.writeText(snapshot)
    }

    override fun clear() {
        file.delete()
    }
}

class PersistentCatalogCacheTest {
    @get:Rule val temporary = TemporaryFolder()
    private val files by lazy { temporary.newFolder("files") }
    private val cache by lazy { temporary.newFolder("cache") }
    private val base = "https://actionanand.github.io/radio-bee-data/v2/"
    private val parser = CatalogParser(base)

    private fun store() = PersistentCatalogCache(files, cache, { parser.parse(it) }, ::DiskSnapshot)

    private val offline = CatalogFetch { throw IOException("offline") }

    private fun repository(storage: CatalogCache, fetch: CatalogFetch = offline) =
        CatalogRepository(base, parser, fetch, storage)

    private fun network() = CatalogFetch { url ->
        val raw = JSONObject(fixture())
        val relative = url.removePrefix(base)
        when {
            relative == "index.json" -> raw.getJSONObject("manifest").toString()
            relative == "home-stations.json" -> raw.getJSONObject("home").toString()
            relative.startsWith("i18n/") ->
                raw.getJSONObject("localization")
                    .getJSONObject(relative.substringAfter('/').substringBefore('.'))
                    .toString()
            else -> {
                val refs = raw.getJSONObject("manifest").getJSONObject("files")
                raw.get(refs.keys().asSequence().single { refs.getString(it) == relative })
                    .toString()
            }
        }
    }

    @Test
    fun offlineColdStartSurvivesOperatingSystemCacheEviction() = runTest {
        val online = repository(store(), network())
        online.start()
        assertFalse(online.state.value.error)
        assertTrue(File(files, "catalogue-v2.json").isFile)
        File(cache, "artwork.png").writeText("reclaimable artwork")
        assertTrue(cache.deleteRecursively())
        val reopened = repository(store())
        reopened.start()
        assertEquals(
            online.state.value.catalog,
            reopened.state.value.catalog,
        )
        assertTrue(reopened.state.value.cached)
        assertTrue(
            reopened.state.value.error
        ) // Offline refresh fails; validated saved data remains usable.
        assertFalse(reopened.state.value.loading)
    }

    @Test
    fun validLegacySnapshotMigratesBeforeCacheEvictionAndOfflineRestart() = runTest {
        val old = File(cache, "catalogue-v2.json")
        old.writeText(fixture())
        val initial = repository(store())
        initial.start()
        assertEquals(2, initial.state.value.catalog!!.stations.size)
        assertEquals(fixture(), File(files, "catalogue-v2.json").readText())
        assertFalse(old.exists())
        cache.deleteRecursively()
        val restarted = repository(store())
        restarted.start()
        assertEquals(2, restarted.state.value.catalog!!.stations.size)
    }

    @Test
    fun malformedLegacySnapshotIsNeverPromoted() = runTest {
        val invalid = JSONObject(fixture())
        invalid.getJSONObject("manifest").getJSONObject("counts").put("stations", 999)
        File(cache, "catalogue-v2.json").writeText(invalid.toString())
        val repo = repository(store())
        repo.start()
        assertNull(repo.state.value.catalog)
        assertTrue(repo.state.value.error)
        assertFalse(File(files, "catalogue-v2.json").exists())
        assertTrue(File(cache, "catalogue-v2.json").exists())
    }

    @Test
    fun durableSnapshotTakesPrecedenceOverInvalidLegacyData() = runTest {
        File(files, "catalogue-v2.json").writeText(fixture())
        File(cache, "catalogue-v2.json").writeText("invalid legacy data")
        val repo = repository(store())
        repo.start()
        assertEquals(2, repo.state.value.catalog!!.stations.size)
        assertEquals(fixture(), File(files, "catalogue-v2.json").readText())
    }

    @Test
    fun explicitClearRemovesBothSnapshotsWithoutTouchingPreferencesOrLoadedData() = runTest {
        val storage = store()
        storage.write(fixture())
        File(cache, "catalogue-v2.json").writeText(fixture())
        val preferences =
            File(files, "tv.preferences_pb").apply { writeText("favorites and settings") }
        val artwork = File(cache, "artwork.png").apply { writeText("unrelated artwork") }
        val repo = repository(storage)
        repo.start()
        repo.clearCache()
        assertEquals(2, repo.state.value.catalog!!.stations.size)
        assertFalse(File(files, "catalogue-v2.json").exists())
        assertFalse(File(cache, "catalogue-v2.json").exists())
        assertEquals("favorites and settings", preferences.readText())
        assertEquals("unrelated artwork", artwork.readText())
        val reopened = repository(store())
        reopened.start()
        assertNull(reopened.state.value.catalog) // Cleared legacy data must not resurrect.
    }

    @Test
    fun failedMigrationKeepsValidatedLegacyDataReadableOffline() = runTest {
        val old = File(cache, "catalogue-v2.json").apply { writeText(fixture()) }
        val storage =
            PersistentCatalogCache(files, cache, { parser.parse(it) }) { file ->
                val disk = DiskSnapshot(file)
                object : CatalogCache by disk {
                    override fun write(snapshot: String) {
                        if (file.parentFile == files) throw IOException("disk full")
                        disk.write(snapshot)
                    }
                }
            }
        val repo = repository(storage)
        repo.start()
        assertEquals(2, repo.state.value.catalog!!.stations.size)
        assertTrue(old.exists())
        assertFalse(File(files, "catalogue-v2.json").exists())
    }

    @Test
    fun malformedRefreshCannotOverwriteDurableLastKnownGood() = runTest {
        val storage = store()
        storage.write(fixture())
        val repo = repository(storage, CatalogFetch { "{\"schemaVersion\":1}" })
        repo.start()
        assertEquals(2, repo.state.value.catalog!!.stations.size)
        assertEquals(fixture(), File(files, "catalogue-v2.json").readText())
        assertTrue(repo.state.value.error)
    }
}
