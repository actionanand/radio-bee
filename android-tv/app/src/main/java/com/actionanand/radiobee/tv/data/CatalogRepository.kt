package com.actionanand.radiobee.tv.data

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject

fun interface CatalogFetch {
    suspend fun get(url: String): String
}

interface CatalogCache {
    fun read(): String?

    fun write(snapshot: String)

    fun clear()
}

data class CatalogState(
    val catalog: Catalog? = null,
    val loading: Boolean = true,
    val cached: Boolean = false,
    val error: Boolean = false,
)

class CatalogRepository(
    private val base: String,
    private val parser: CatalogParser,
    private val fetch: CatalogFetch,
    private val cache: CatalogCache,
) {
    private val mutex = Mutex()
    private val mutable = MutableStateFlow(CatalogState())
    val state = mutable.asStateFlow()

    suspend fun start() {
        withContext(Dispatchers.IO) {
            runCatching {
                cache.read()?.let {
                    mutable.value = CatalogState(parser.parse(it), cached = true, loading = false)
                }
            }
        }
        refresh()
    }

    suspend fun refresh() = mutex.withLock {
        mutable.value = mutable.value.copy(loading = true, error = false)
        try {
            val manifest = JSONObject(fetch.get(parser.relative("index.json")))
            require(manifest.getInt("schemaVersion") == 2)
            val raw = JSONObject().put("manifest", manifest)
            val files = manifest.getJSONObject("files")
            for (key in files.keys()) {
                if (key == "browseIndex") continue
                val filename = files.getString(key)
                val value = fetch.get(parser.relative(filename))
                // Optional browse-index is a hint; canonical parsing never depends on it.
                if (key != "browseIndex") raw.put(key, org.json.JSONTokener(value).nextValue())
            }
            val localized = JSONObject()
            for (locale in listOf("en", "ta", "sa")) localized.put(
                locale,
                JSONObject(fetch.get(parser.relative("i18n/$locale.json"))),
            )
            raw.put("localization", localized)
            try {
                raw.put("home", JSONObject(fetch.get(parser.relative("home-stations.json"))))
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (_: Exception) {
                /* Discovery still works without optional editorial Home. */
            }
            require(
                JSONObject(fetch.get(parser.relative("index.json"))).toString() ==
                    manifest.toString()
            ) {
                "Catalogue changed during refresh"
            }
            val snapshot = raw.toString()
            val next = parser.parse(snapshot)
            // Validate before AtomicFile replacement; never overwrite last-known-good on error.
            withContext(Dispatchers.IO) { cache.write(snapshot) }
            mutable.value = CatalogState(next, loading = false)
        } catch (cancel: CancellationException) {
            mutable.value = mutable.value.copy(loading = false)
            throw cancel
        } catch (_: Exception) {
            mutable.value = mutable.value.copy(loading = false, error = true)
        }
    }

    suspend fun clearCache() {
        mutex.withLock {
            withContext(Dispatchers.IO) { cache.clear() }
            mutable.value = mutable.value.copy(cached = false)
        }
    }
}

/** No proxy, credentials, downgrade redirects, or unbounded response buffering. */
object HttpsCatalogFetch : CatalogFetch {
    override suspend fun get(url: String): String =
        withContext(Dispatchers.IO) {
            require(validUrl(url))
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 10000
            connection.readTimeout = 15000
            connection.instanceFollowRedirects = false
            try {
                require(connection.responseCode == 200) { "Catalogue request failed" }
                connection.inputStream.use { input ->
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        require(output.size() + count <= 8 * 1024 * 1024)
                        output.write(buffer, 0, count)
                    }
                    output.toString(Charsets.UTF_8.name())
                }
            } finally {
                connection.disconnect()
            }
        }
}
