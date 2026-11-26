package com.actionanand.radiobee.tv.playback

import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.Executor

/** Own exactly one controller while started; late completions cannot revive a hidden Activity. */
internal class StartedControllerConnection<T>(
    private val connect: () -> ListenableFuture<T>,
    private val release: (ListenableFuture<T>) -> Unit,
    private val connected: (T) -> Unit,
    private val disconnected: () -> Unit,
    private val failed: () -> Unit,
    private val executor: Executor,
) {
    private var current: ListenableFuture<T>? = null

    fun start() {
        if (current != null) return
        val future =
            try {
                connect()
            } catch (_: Exception) {
                failed()
                return
            }
        current = future
        future.addListener(
            {
                if (current === future) {
                    runCatching { future.get() }.onSuccess(connected).onFailure { failed() }
                }
            },
            executor,
        )
    }

    fun stop() {
        val future = current ?: return
        current = null
        disconnected()
        release(future)
    }
}
