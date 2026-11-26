package com.actionanand.radiobee.tv.data

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import org.junit.Assert.*
import org.junit.Test

class AtomicCatalogCacheTest {
    @Test
    fun interruptedLegacyWriteRecoversBackupWhenBaseFileIsMissing() {
        val root =
            File(
                InstrumentationRegistry.getInstrumentation().targetContext.cacheDir,
                "tv-atomic-test-${UUID.randomUUID()}",
            )
        assertTrue(root.mkdir())
        try {
            val file = File(root, "catalogue.json")
            val cache = AtomicCatalogCache(file)
            cache.write("last validated snapshot")
            assertTrue(file.renameTo(File(root, "catalogue.json.bak")))
            assertFalse(file.exists())
            assertEquals("last validated snapshot", cache.read())
            cache.clear()
            assertNull(cache.read())
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun persistentAtomicSnapshotSurvivesEvictionOfAndroidCacheDirectory() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "tv-persistence-test-${UUID.randomUUID()}"
        val files = File(context.filesDir, name).apply { check(mkdir()) }
        val cache = File(context.cacheDir, name).apply { check(mkdir()) }
        try {
            val snapshot = "validated snapshot"
            val storage = PersistentCatalogCache(files, cache, { check(it == snapshot) })
            storage.write(snapshot)
            File(cache, "artwork.png").writeText("reclaimable")
            assertTrue(cache.deleteRecursively())
            assertEquals(
                snapshot,
                PersistentCatalogCache(files, cache, { check(it == snapshot) }).read(),
            )
            storage.clear()
            assertNull(storage.read())
        } finally {
            files.deleteRecursively()
            cache.deleteRecursively()
        }
    }
}
