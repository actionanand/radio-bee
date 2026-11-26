package com.actionanand.radiobee.tv.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.*
import org.json.JSONArray

data class UserSettings(
    val locale: String = "en",
    val background: Boolean = true,
    val favorites: Set<String> = emptySet(),
    val recent: List<String> = emptyList(),
    val lastStation: String? = null,
    val sleepUntil: Long = 0,
    val backgroundConfigured: Boolean = false,
    val loaded: Boolean = false,
)

class UserPreferences(private val store: DataStore<Preferences>, scope: CoroutineScope) {
    private val locale = stringPreferencesKey("locale")
    private val background = booleanPreferencesKey("background")
    private val favorites = stringSetPreferencesKey("favorites")
    private val recent = stringPreferencesKey("recent")
    private val last = stringPreferencesKey("last")
    private val sleep = longPreferencesKey("sleep_until")
    val writeError = MutableStateFlow(false)
    val state =
        store.data
            .catch { error ->
                if (error is IOException) {
                    writeError.value = true
                    emit(emptyPreferences())
                } else throw error
            }
            .map { p ->
                UserSettings(
                    p[locale]?.takeIf { it in listOf("en", "ta", "sa") } ?: "en",
                    p[background] ?: true,
                    p[favorites] ?: emptySet(),
                    runCatching {
                            val a = JSONArray(p[recent] ?: "[]")
                            (0 until a.length()).map { a.getString(it) }.distinct().take(20)
                        }
                        .getOrDefault(emptyList()),
                    p[last],
                    p[sleep] ?: 0,
                    p[background] != null,
                    true,
                )
            }
            .stateIn(scope, SharingStarted.Eagerly, UserSettings())

    private suspend fun update(block: (MutablePreferences) -> Unit): Boolean {
        try {
            store.edit(block)
            writeError.value = false
            return true
        } catch (error: IOException) {
            writeError.value = true
            return false
        }
    }

    suspend fun setLocale(value: String) {
        require(value in listOf("en", "ta", "sa"))
        update { it[locale] = value }
    }

    suspend fun setBackground(value: Boolean) = update { it[background] = value }

    suspend fun toggleFavorite(id: String) = update { p ->
        val values = p[favorites] ?: emptySet()
        p[favorites] = if (id in values) values - id else values + id
    }

    suspend fun select(id: String) = update { it[last] = id }

    suspend fun played(id: String) = update { p ->
        val values = runCatching {
            val a = JSONArray(p[recent] ?: "[]")
            (0 until a.length()).map { a.getString(it) }
        }
            .getOrDefault(emptyList())
        p[recent] = JSONArray((listOf(id) + values).distinct().take(20)).toString()
        p[last] = id
    }

    suspend fun setSleep(deadline: Long) = update { it[sleep] = deadline }
}
