package com.actionanand.radiobee.tv.playback

import androidx.media3.common.Player

/** Framework binding keys represent groups of clients sharing Intent.filterEquals semantics. */
internal class MediaServiceLifetime<Binding>(private val stopService: () -> Unit) {
    private val bindings = mutableSetOf<Binding>()
    private var stopRequested = false

    val hasBindings
        get() = bindings.isNotEmpty()

    fun bound(key: Binding) {
        bindings.add(key)
        stopRequested = false
    }

    fun unbound(key: Binding) {
        bindings.remove(key)
    }

    fun update(playWhenReady: Boolean, state: Int, retrying: Boolean, foreground: Boolean) {
        val active =
            playWhenReady &&
                (state == Player.STATE_READY || state == Player.STATE_BUFFERING || retrying)
        if (hasBindings || active || foreground) {
            stopRequested = false
            return
        }
        if (!stopRequested) {
            stopRequested = true
            stopService()
        }
    }
}
