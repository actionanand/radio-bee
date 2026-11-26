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

    fun onTaskRemoved(background: Boolean, foreground: Boolean): Boolean {
        val active =
            player.playbackState == Player.STATE_READY ||
                player.playbackState == Player.STATE_BUFFERING
        if (background && foreground && player.playWhenReady && active) return false
        stop()
        return true
    }
}

/**
 * Home/onStop preserves background audio; the controller handles cancellation on explicit pause.
 */
internal fun onAppBackgrounded(
    background: Boolean,
    cancelPending: () -> Unit = {},
    pause: () -> Unit,
) {
    // A delayed preference save must not start a new station after the Activity has left.
    cancelPending()
    if (!background) pause()
}
