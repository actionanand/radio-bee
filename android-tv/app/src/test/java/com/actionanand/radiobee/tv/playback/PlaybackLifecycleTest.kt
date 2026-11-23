package com.actionanand.radiobee.tv.playback

import androidx.media3.common.Player
import com.actionanand.radiobee.tv.data.CatalogParser
import com.actionanand.radiobee.tv.data.fixture
import java.lang.reflect.Proxy
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

/** Models Media3's stop contract: stop changes state, but deliberately retains playWhenReady. */
private class Media3Transport {
    var intent = true
    var items = 1
    var state = Player.STATE_READY
    val calls = mutableListOf<String>()
    val player =
        Proxy.newProxyInstance(Player::class.java.classLoader, arrayOf(Player::class.java)) {
            _,
            method,
            _ ->
            when (method.name) {
                "getPlayWhenReady" -> intent
                "getPlaybackState" -> state
                "getMediaItemCount" -> items
                "pause" -> {
                    calls += "pause"
                    intent = false
                    null
                }
                "play" -> {
                    calls += "play"
                    intent = true
                    null
                }
                "stop" -> {
                    calls += "stop(intent=$intent)"
                    state = Player.STATE_IDLE
                    null
                }
                "clearMediaItems" -> {
                    calls += "clear(intent=$intent)"
                    items = 0
                    null
                }
                else -> error("Unexpected player call: ${method.name}")
            }
        } as Player
}

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class PlaybackLifecycleTest {
    @Test
    fun stopThenHomeClearsIntentBeforeStopAndAllowsServiceShutdown() {
        val transport = Media3Transport()
        var cancellations = 0
        val lifecycle = PlaybackLifecycle(transport.player) { cancellations++ }
        lifecycle.stop()
        assertEquals(listOf("pause", "stop(intent=false)", "clear(intent=false)"), transport.calls)
        onAppBackgrounded(true) { lifecycle.pause() }
        assertFalse(transport.intent)
        assertEquals(0, transport.items)
        assertEquals(1, cancellations)
        assertTrue(lifecycle.onTaskRemoved(true))
    }

    @Test
    fun sleepExpiryThenHomeCannotLeavePlaybackIntentOrRestartAudio() = runTest {
        val transport = Media3Transport()
        val lifecycle = PlaybackLifecycle(transport.player) {}
        val timer = SleepTimer(backgroundScope, { testScheduler.currentTime }) { lifecycle.stop() }
        timer.replace(1000)
        advanceTimeBy(1000)
        runCurrent()
        onAppBackgrounded(true) { lifecycle.pause() }
        assertFalse(transport.intent)
        assertEquals(0, transport.items)
        assertEquals(0L, timer.remaining.value)
        assertTrue(lifecycle.onTaskRemoved(true))
        advanceTimeBy(10_000)
        runCurrent()
        assertFalse(transport.calls.contains("play"))
    }

    @Test
    fun exhaustedTransientRetriesThenHomeTerminateInsteadOfKeepingAnIdleServiceAlive() {
        val transport = Media3Transport()
        val lifecycle = PlaybackLifecycle(transport.player) {}
        val stream =
            CatalogParser("https://actionanand.github.io/radio-bee-data/v2/")
                .parse(fixture())
                .stations
                .first()
                .streams
                .first()
        val budget = RetryBudget()
        budget.begin(listOf(stream))
        repeat(2) {
            assertNotNull(budget.next(stream.url, true))
            lifecycle.stopForRetry()
            assertTrue(transport.intent)
        }
        assertNull(budget.next(stream.url, true))
        lifecycle.stop()
        onAppBackgrounded(true) { lifecycle.pause() }
        assertEquals(3, budget.number())
        assertFalse(transport.intent)
        assertEquals(0, transport.items)
        assertTrue(lifecycle.onTaskRemoved(true))
        assertNull(budget.next(stream.url, true))
    }

    @Test
    fun activeBackgroundPlaybackSurvivesHomeAndTaskRemoval() {
        val transport = Media3Transport()
        val lifecycle =
            PlaybackLifecycle(transport.player) {
                error("Active background playback must not be cancelled")
            }
        onAppBackgrounded(true) { lifecycle.pause() }
        assertFalse(lifecycle.onTaskRemoved(true))
        assertTrue(transport.intent)
        assertEquals(1, transport.items)
        assertTrue(transport.calls.isEmpty())
    }

    @Test
    fun retryBackoffRetainsIntentAndItemWhenHomeAllowsBackgroundAudio() {
        val transport = Media3Transport()
        val lifecycle =
            PlaybackLifecycle(transport.player) {
                error("Retry hold must retain the pending attempt")
            }
        lifecycle.stopForRetry()
        onAppBackgrounded(true) { lifecycle.pause() }
        assertEquals(Player.STATE_IDLE, transport.state)
        assertTrue(transport.intent)
        assertEquals(1, transport.items)
        assertFalse(lifecycle.onTaskRemoved(true))
        assertEquals(listOf("stop(intent=true)"), transport.calls)
    }

    @Test
    fun backgroundDisabledPausesOnHomeAndStopsOnTaskRemoval() {
        val transport = Media3Transport()
        var cancelled = 0
        val lifecycle = PlaybackLifecycle(transport.player) { cancelled++ }
        onAppBackgrounded(false) { lifecycle.pause() }
        assertFalse(transport.intent)
        assertEquals(1, transport.items) // Pause retains the selected station.
        assertEquals(1, cancelled)
        assertTrue(lifecycle.onTaskRemoved(false))
        assertEquals(0, transport.items)
    }

    @Test
    fun taskRemovalWithBackgroundDisabledStopsEvenBeforeActivityPauseArrives() {
        val transport = Media3Transport()
        val lifecycle = PlaybackLifecycle(transport.player) {}
        assertTrue(lifecycle.onTaskRemoved(false))
        assertEquals(listOf("pause", "stop(intent=false)", "clear(intent=false)"), transport.calls)
        assertFalse(transport.intent)
    }

    @Test
    fun stopCancelsDelayedRecoveryBeforeHomeOrDestruction() = runTest {
        val transport = Media3Transport()
        val epoch = PlaybackEpoch()
        var pending: Job? = null
        val lifecycle =
            PlaybackLifecycle(transport.player) {
                epoch.cancel()
                pending?.cancel()
            }
        val token = epoch.current()
        pending = backgroundScope.launch {
            delay(1000)
            if (epoch.accepts(token)) transport.player.play()
        }
        runCurrent()
        lifecycle.stop()
        onAppBackgrounded(true) { lifecycle.pause() }
        advanceTimeBy(2000)
        runCurrent()
        assertTrue(pending!!.isCancelled)
        assertFalse(epoch.accepts(token))
        assertFalse(transport.intent)
        assertFalse(transport.calls.contains("play"))
        assertTrue(lifecycle.onTaskRemoved(true))
    }

    @Test
    fun repeatedStopTaskRemovalAndDestroyCleanupAreIdempotent() {
        val transport = Media3Transport()
        val lifecycle = PlaybackLifecycle(transport.player) {}
        lifecycle.stop()
        assertTrue(lifecycle.onTaskRemoved(true))
        lifecycle.stop() // The service's onDestroy boundary.
        assertFalse(transport.intent)
        assertEquals(0, transport.items)
        assertFalse(transport.calls.contains("stop(intent=true)"))
    }
}
