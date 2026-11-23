package com.actionanand.radiobee.tv.data

import java.io.File
import java.io.IOException

/** Durable last-known-good storage, with validated migration of the original reclaimable cache. */
class PersistentCatalogCache(
    filesDir: File,
    cacheDir: File,
    private val validate: (String) -> Unit,
    storage: (File) -> CatalogCache = ::AtomicCatalogCache,
) : CatalogCache {
    private val durable = storage(File(filesDir, "catalogue-v2.json"))
    private val legacy = storage(File(cacheDir, "catalogue-v2.json"))

    // AtomicFile does not serialize callers; Clear Cache must not race legacy promotion.
    @Synchronized
    override fun read(): String? {
        durable.read()?.let {
            return it
        }
        val snapshot = legacy.read() ?: return null
        validate(snapshot)
        try {
            durable.write(snapshot)
            legacy.clear()
        } catch (_: IOException) {
            // Keep valid legacy data readable offline if migration cannot be persisted yet.
        }
        return snapshot
    }

    @Synchronized
    override fun write(snapshot: String) {
        durable.write(snapshot)
        legacy.clear()
    }

    @Synchronized
    override fun clear() {
        durable.clear()
        legacy.clear()
    }
}
