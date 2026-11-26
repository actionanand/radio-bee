package com.actionanand.radiobee.tv.playback

import androidx.media3.common.Player
import org.junit.Assert.*
import org.junit.Test

class MediaServiceLifetimeTest {
    @Test
    fun idleVisibleBindingKeepsServiceAvailableForPlay() {
        var stops = 0
        val lifetime = MediaServiceLifetime<String> { stops++ }
        lifetime.bound("ui")
        lifetime.update(false, Player.STATE_IDLE, false, false)
        assertEquals(0, stops)
        assertTrue(lifetime.hasBindings)
    }

    @Test
    fun stopWhileBoundThenHomeStopsOnlyAfterLastUnbind() {
        var stops = 0
        val lifetime = MediaServiceLifetime<String> { stops++ }
        lifetime.bound("ui")
        lifetime.update(false, Player.STATE_IDLE, false, false)
        assertEquals(0, stops)
        lifetime.unbound("ui")
        lifetime.update(false, Player.STATE_IDLE, false, false)
        assertEquals(1, stops)
    }

    @Test
    fun headlessTerminalPlaybackWaitsForMedia3ForegroundDemotion() {
        var stops = 0
        val lifetime = MediaServiceLifetime<String> { stops++ }
        lifetime.update(true, Player.STATE_READY, false, true)
        lifetime.update(false, Player.STATE_IDLE, false, true)
        assertEquals(0, stops)
        lifetime.update(false, Player.STATE_IDLE, false, false)
        assertEquals(1, stops)
    }

    @Test
    fun multipleBindingsAndUnknownUnbindCannotStopActiveUi() {
        var stops = 0
        val lifetime = MediaServiceLifetime<String> { stops++ }
        lifetime.bound("first")
        lifetime.bound("second")
        lifetime.unbound("unknown")
        lifetime.unbound("first")
        lifetime.update(false, Player.STATE_IDLE, false, false)
        assertEquals(0, stops)
        lifetime.unbound("second")
        lifetime.update(false, Player.STATE_IDLE, false, false)
        assertEquals(1, stops)
    }

    @Test
    fun rebindBeforeDeferredIdleCheckPreventsShutdown() {
        var stops = 0
        val lifetime = MediaServiceLifetime<String> { stops++ }
        lifetime.bound("old")
        lifetime.unbound("old")
        lifetime.bound("new")
        lifetime.update(false, Player.STATE_IDLE, false, false)
        assertEquals(0, stops)
    }

    @Test
    fun resumeBeforeDeferredIdleCheckPreservesPlaybackAndBuffering() {
        var stops = 0
        val lifetime = MediaServiceLifetime<String> { stops++ }
        lifetime.update(true, Player.STATE_BUFFERING, false, false)
        lifetime.update(true, Player.STATE_READY, false, true)
        assertEquals(0, stops)
    }

    @Test
    fun boundedRetrySurvivesHomeButExhaustionStopsIdleService() {
        var stops = 0
        val lifetime = MediaServiceLifetime<String> { stops++ }
        lifetime.update(true, Player.STATE_IDLE, true, false)
        assertEquals(0, stops)
        lifetime.update(false, Player.STATE_IDLE, false, false)
        assertEquals(1, stops)
    }

    @Test
    fun endedOrIdleIntentWithoutRecoveryDoesNotRetainHeadlessService() {
        for (state in listOf(Player.STATE_IDLE, Player.STATE_ENDED)) {
            var stops = 0
            val lifetime = MediaServiceLifetime<String> { stops++ }
            lifetime.update(true, state, false, false)
            assertEquals(1, stops)
        }
    }

    @Test
    fun repeatedNotificationsRequestOneStopUntilRebound() {
        var stops = 0
        val lifetime = MediaServiceLifetime<String> { stops++ }
        repeat(3) { lifetime.update(false, Player.STATE_IDLE, false, false) }
        assertEquals(1, stops)
        lifetime.bound("ui")
        lifetime.unbound("ui")
        lifetime.update(false, Player.STATE_IDLE, false, false)
        assertEquals(2, stops)
    }

    @Test
    fun pausedCountdownSurvivesHomeWithoutForegroundAndStopsAfterExpiryOrOff() {
        var stops = 0
        val lifetime = MediaServiceLifetime<String> { stops++ }
        lifetime.bound("ui")
        lifetime.unbound("ui")
        lifetime.update(false, Player.STATE_READY, false, false, timedSession = true)
        assertEquals(0, stops)
        lifetime.update(false, Player.STATE_READY, false, false, timedSession = false)
        assertEquals(1, stops)
    }
}
