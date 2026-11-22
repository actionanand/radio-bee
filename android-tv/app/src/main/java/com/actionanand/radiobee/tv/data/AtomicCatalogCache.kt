package com.actionanand.radiobee.tv.data

import android.util.AtomicFile
import java.io.File
import java.io.FileNotFoundException

/** Let AtomicFile recover legacy backups before inspecting the readable snapshot. */
class AtomicCatalogCache(file: File) : CatalogCache {
    private val atomic = AtomicFile(file)

    override fun read(): String? =
        try {
            atomic.openRead().use { input ->
                require(input.channel.size() <= CatalogParser.MAX_SNAPSHOT_BYTES)
                input.bufferedReader(Charsets.UTF_8).use { it.readText() }
            }
        } catch (_: FileNotFoundException) {
            null
        }

    override fun write(snapshot: String) {
        val stream = atomic.startWrite()
        try {
            stream.write(snapshot.toByteArray(Charsets.UTF_8))
            atomic.finishWrite(stream)
        } catch (error: Exception) {
            atomic.failWrite(stream)
            throw error
        }
    }

    override fun clear() = atomic.delete()
}
