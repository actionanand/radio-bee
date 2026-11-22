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
}
