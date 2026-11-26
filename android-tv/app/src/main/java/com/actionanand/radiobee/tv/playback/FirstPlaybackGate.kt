package com.actionanand.radiobee.tv.playback

import com.actionanand.radiobee.tv.data.UserPreferences
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/**
 * Shared by card, remote and MediaSession entry points; no transport can bypass the saved choice.
 */
class FirstPlaybackGate(
    private val preferences: UserPreferences,
    private val scope: CoroutineScope,
) {
    private val requestState = MutableStateFlow<String?>(null)
    val station = requestState.asStateFlow()
    private val savingState = MutableStateFlow(false)
    val saving = savingState.asStateFlow()
    private val errorState = MutableStateFlow(false)
    val error = errorState.asStateFlow()
    private var action: (() -> Unit)? = null
    private var generation = 0
    private var waiting: Job? = null

    fun request(id: String, play: () -> Unit) {
        if (requestState.value != null || savingState.value) return
        waiting?.cancel()
        val token = ++generation
        waiting = scope.launch {
            val settings = preferences.state.first { it.loaded }
            if (token != generation) return@launch
            if (settings.backgroundConfigured) play()
            else {
                action = play
                requestState.value = id
                errorState.value = false
            }
        }
    }

    fun choose(background: Boolean) {
        if (requestState.value == null || savingState.value) return
        val token = generation
        savingState.value = true
        scope.launch {
            try {
                if (!preferences.setBackground(background)) {
                    if (token == generation) errorState.value = true
                    return@launch
                }
                // DataStore edit is durable; wait for its observable state before starting
                // playback.
                preferences.state.first {
                    it.loaded && it.backgroundConfigured && it.background == background
                }
                if (token == generation) {
                    val play = action
                    action = null
                    requestState.value = null
                    errorState.value = false
                    play?.invoke()
                }
            } finally {
                savingState.value = false
            }
        }
    }

    fun cancel() {
        ++generation
        waiting?.cancel()
        waiting = null
        action = null
        requestState.value = null
        errorState.value = false
    }
}
