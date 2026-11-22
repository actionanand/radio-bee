package com.actionanand.radiobee.tv

import android.app.Application
import android.util.AtomicFile
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import com.actionanand.radiobee.tv.data.*
import com.actionanand.radiobee.tv.playback.PlaybackViewState
import java.io.File
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow

class RadioBeeApplication : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
    }
}

class AppGraph(app: Application) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val preferences =
        UserPreferences(
            PreferenceDataStoreFactory.create(
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
            ) {
                app.preferencesDataStoreFile("tv")
            },
            scope,
        )
    val policy =
        PlaybackPolicy(
            BuildConfig.ALLOW_UNVERIFIED,
            BuildConfig.CHECK_VERIFICATION_STATUS,
            BuildConfig.CHECK_RIGHTS_STATUS,
            BuildConfig.ALLOW_HTTP_STREAMS,
        )
    private val file = AtomicFile(File(app.cacheDir, "catalogue-v2.json"))
    private val cache =
        object : CatalogCache {
            override fun read(): String? =
                if (file.baseFile.exists()) {
                    require(file.baseFile.length() <= CatalogParser.MAX_SNAPSHOT_BYTES)
                    file.openRead().bufferedReader().use { it.readText() }
                } else null

            override fun write(snapshot: String) {
                val stream = file.startWrite()
                try {
                    stream.write(snapshot.toByteArray())
                    file.finishWrite(stream)
                } catch (error: Exception) {
                    file.failWrite(stream)
                    throw error
                }
            }

            override fun clear() = file.delete()
        }
    val catalog =
        CatalogRepository(
            BuildConfig.CATALOG_URL,
            CatalogParser(BuildConfig.CATALOG_URL, BuildConfig.ALLOW_HTTP_STREAMS),
            HttpsCatalogFetch,
            cache,
        )
    val playback = MutableStateFlow(PlaybackViewState())
    val sleepRemaining = MutableStateFlow(0L)

    init {
        scope.launch { catalog.start() }
    }
}
