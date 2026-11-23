package com.actionanand.radiobee.tv.playback

import androidx.media3.common.Player

/**
 * Shared terminal and task-removal boundaries; retry holds deliberately preserve playback intent.
 */
internal class PlaybackLifecycle(
    private val player: Player,
    private val cancelPending: () -> Unit,
) {
    fun pause() {
        cancelPending()
        player.pause()
    }

    fun stop() {
        pause()
        player.stop()
        player.clearMediaItems()
    }

    fun stopForRetry() {
        player.stop()
    }

    fun onTaskRemoved(background: Boolean): Boolean {
        if (background && player.playWhenReady) return false
        stop()
        return true
    }
}

/**
 * Home/onStop preserves background audio; the controller handles cancellation on explicit pause.
 */
internal fun onAppBackgrounded(background: Boolean, pause: () -> Unit) {
    if (!background) pause()
}
