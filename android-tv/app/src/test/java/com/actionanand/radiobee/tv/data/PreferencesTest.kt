package com.actionanand.radiobee.tv.data

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import java.nio.file.Files
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

class PreferencesTest {
    @Test
    fun favoritesRecentsLocaleAndBackgroundPersistAcrossInstances() = runTest {
        val directory = Files.createTempDirectory("radiobee-tv-prefs").toFile()
        val file = directory.resolve("test.preferences_pb")
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = PreferenceDataStoreFactory.create(scope = scope) { file }
        val prefs = UserPreferences(store, backgroundScope)
        prefs.toggleFavorite("air-nagercoil")
        prefs.played("air-nagercoil")
        prefs.played("sooriyan-srilanka")
        prefs.played("air-nagercoil")
        prefs.setLocale("ta")
        prefs.setBackground(false)
        prefs.setSleep(12345)
        val saved = prefs.state.first { it.locale == "ta" }
        assertEquals(setOf("air-nagercoil"), saved.favorites)
        assertEquals(listOf("air-nagercoil", "sooriyan-srilanka"), saved.recent)
        assertFalse(saved.background)
        assertEquals(12345L, saved.sleepUntil)
        scope.cancel()
        scope.coroutineContext[Job]!!.join()
        val secondScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val second = PreferenceDataStoreFactory.create(scope = secondScope) { file }
            val restored = second.data.first()
            assertEquals(
                "ta",
                restored[androidx.datastore.preferences.core.stringPreferencesKey("locale")],
            )
            assertEquals("air-nagercoil", saved.lastStation)
        } finally {
            secondScope.cancel()
            secondScope.coroutineContext[Job]!!.join()
            directory.deleteRecursively()
        }
    }
}
