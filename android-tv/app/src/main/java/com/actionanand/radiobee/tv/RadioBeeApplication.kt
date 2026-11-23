package com.actionanand.radiobee.tv

import android.app.Application
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import com.actionanand.radiobee.tv.data.*
import com.actionanand.radiobee.tv.playback.PlaybackViewState
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
    private val parser = CatalogParser(BuildConfig.CATALOG_URL, BuildConfig.ALLOW_HTTP_STREAMS)
    private val cache = PersistentCatalogCache(app.filesDir, app.cacheDir, { parser.parse(it) })
    val catalog =
        CatalogRepository(
            BuildConfig.CATALOG_URL,
            parser,
            HttpsCatalogFetch,
            cache,
        )
    val playback = MutableStateFlow(PlaybackViewState())
    val sleepRemaining = MutableStateFlow(0L)

    init {
        scope.launch { catalog.start() }
    }
}
