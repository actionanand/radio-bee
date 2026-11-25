package com.actionanand.radiobee.tv.playback

import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SleepSessionTimerTest {
    private class Harness(val scope: TestScope) {
        var persisted = 0L
        var active = true
        var stops = 0
        var saveFails = false
        var saveBlock: CompletableDeferred<Unit>? = null
        var clockOffset = 0L
        val notices = mutableListOf<SleepNotice>()
        val timer =
            SleepSessionTimer(
                scope.backgroundScope,
                scope.backgroundScope,
                read = { persisted },
                save = { value ->
                    saveBlock?.await()
                    if (saveFails) false
                    else {
                        persisted = value
                        true
                    }
                },
                hasSession = { active },
                notice = { notices += it },
                expire = {
                    stops++
                    active = false
                },
                now = { scope.testScheduler.currentTime + clockOffset },
            )
    }

    @Test
    fun allFourDurationsPersistAndExpireWithoutVisibleUi() = runTest {
        for (minutes in listOf(15, 30, 45, 60)) {
            val h = Harness(this)
            assertTrue(h.timer.set(minutes))
            assertEquals(testScheduler.currentTime + minutes * 60000L, h.persisted)
            runCurrent()
            advanceTimeBy(minutes * 60000L)
            runCurrent()
            assertEquals(1, h.stops)
            assertEquals(0L, h.persisted)
            assertEquals("expired", h.notices.last().action)
            h.timer.close()
            runCurrent()
        }
    }

    @Test
    fun offCancelsCountdownWithoutStoppingPlayingOrPausedSession() = runTest {
        for (state in listOf("playing", "paused")) {
            val h = Harness(this)
            h.timer.set(15)
            advanceTimeBy(1000)
            assertTrue(h.timer.set(0))
            advanceTimeBy(16 * 60000L)
            runCurrent()
            assertEquals(state, 0, h.stops)
            assertTrue(h.active)
            assertEquals(0L, h.persisted)
            assertEquals(0L, h.timer.remaining.value)
            assertEquals("cancelled", h.notices.last().action)
        }
    }

    @Test
    fun replacementPreventsOldDeadlineFromStoppingSession() = runTest {
        val h = Harness(this)
        h.timer.set(15)
        advanceTimeBy(60000)
        h.timer.set(30)
        advanceTimeBy(14 * 60000L)
        runCurrent()
        assertEquals(0, h.stops)
        assertEquals("replaced", h.notices.last().action)
        advanceTimeBy(16 * 60000L)
        runCurrent()
        assertEquals(1, h.stops)
    }

    @Test
    fun manualStopImmediatelyCancelsRuntimeAndClearsPersistedDeadline() = runTest {
        val h = Harness(this)
        h.timer.set(15)
        h.active = false
        h.timer.cancel()
        runCurrent()
        assertEquals(0L, h.persisted)
        assertEquals(0L, h.timer.remaining.value)
        advanceTimeBy(16 * 60000L)
        runCurrent()
        assertEquals(0, h.stops)
    }

    @Test
    fun pauseAndStationSwitchKeepSameCountdown() = runTest {
        val h = Harness(this)
        h.timer.set(15)
        val deadline = h.persisted
        // Neither Pause nor a station switch calls the terminal cancellation boundary.
        advanceTimeBy(50000)
        runCurrent()
        assertEquals(deadline, h.persisted)
        assertEquals(850000L, h.timer.remaining.value)
        advanceTimeBy(850000)
        runCurrent()
        assertEquals(1, h.stops)
    }

    @Test
    fun expiryWhileBufferingOrRetryingStopsOnceAndClearsDeadline() = runTest {
        for (state in listOf("buffering", "retrying", "paused")) {
            val h = Harness(this)
            h.timer.set(15)
            advanceTimeBy(900000)
            runCurrent()
            assertEquals(state, 1, h.stops)
            assertEquals(0L, h.persisted)
            advanceTimeBy(60000)
            runCurrent()
            assertEquals(1, h.stops)
        }
    }

    @Test
    fun returnFromBackgroundReadsCurrentRemainingTime() = runTest {
        val h = Harness(this)
        h.timer.set(30)
        advanceTimeBy(5 * 60000L)
        runCurrent()
        assertEquals(25 * 60000L, h.timer.remaining.value)
    }

    @Test
    fun expiredStoredDeadlineIsClearedWithoutStartingOrStoppingNewPlayback() = runTest {
        val h = Harness(this)
        h.persisted = 100
        h.clockOffset = 1000
        h.active = false
        h.timer.initialize()
        runCurrent()
        assertEquals(0L, h.persisted)
        assertEquals(0, h.stops)
        assertEquals(0L, h.timer.remaining.value)
    }

    @Test
    fun processRecreationClearsFutureOrphanDeadlineWithoutAutoplay() = runTest {
        val h = Harness(this)
        h.persisted = 900000
        h.active = false
        h.timer.initialize()
        runCurrent()
        assertEquals(0L, h.persisted)
        assertEquals(0, h.stops)
    }

    @Test
    fun noCountdownCanBeSetWithoutSessionButOffStillWorks() = runTest {
        val h = Harness(this)
        h.active = false
        assertFalse(h.timer.set(15))
        assertTrue(h.timer.set(0))
        assertEquals(0L, h.persisted)
        assertEquals(0, h.stops)
    }

    @Test
    fun failedSaveDoesNotInventCountdownOrConfirmation() = runTest {
        val h = Harness(this)
        h.saveFails = true
        assertFalse(h.timer.set(15))
        runCurrent()
        assertEquals(0L, h.timer.remaining.value)
        assertTrue(h.notices.isEmpty())
    }

    @Test
    fun stopDuringDelayedSaveCannotRearmStaleTimer() = runTest {
        val h = Harness(this)
        h.saveBlock = CompletableDeferred()
        val set = async { h.timer.set(15) }
        runCurrent()
        h.timer.cancel()
        h.active = false
        h.saveBlock!!.complete(Unit)
        runCurrent()
        assertFalse(set.await())
        assertEquals(0L, h.persisted)
        advanceTimeBy(1000000)
        runCurrent()
        assertEquals(0, h.stops)
    }

    @Test
    fun destroyedServiceCannotArmTimerAndClearsSavedState() = runTest {
        val h = Harness(this)
        h.timer.set(15)
        h.timer.close()
        runCurrent()
        assertFalse(h.timer.set(30))
        assertEquals(0L, h.persisted)
        advanceTimeBy(1000000)
        runCurrent()
        assertEquals(0, h.stops)
    }

    @Test
    fun forwardClockChangeExpiresOnNextTickWithoutAutoplay() = runTest {
        val h = Harness(this)
        h.timer.set(15)
        runCurrent()
        h.clockOffset = 1000000
        advanceTimeBy(1000)
        runCurrent()
        assertEquals(1, h.stops)
        assertEquals(0L, h.persisted)
    }

    @Test
    fun backwardClockChangeExtendsWallClockDeadlineWithoutDuplicateExpiry() = runTest {
        val h = Harness(this)
        h.timer.set(15)
        runCurrent()
        h.clockOffset = -60000
        advanceTimeBy(900000)
        runCurrent()
        assertEquals(0, h.stops)
        advanceTimeBy(60000)
        runCurrent()
        assertEquals(1, h.stops)
    }

    @Test
    fun arbitraryDurationsAreRejectedWithoutChangingSavedTimer() = runTest {
        val h = Harness(this)
        h.timer.set(15)
        val saved = h.persisted
        for (minutes in listOf(-1, 1, 240, Int.MAX_VALUE)) assertFalse(h.timer.set(minutes))
        assertEquals(saved, h.persisted)
    }

    @Test
    fun delayedInitializationNeverAttachesOldCountdownToNewStation() = runTest {
        val h = Harness(this)
        h.active = false
        h.persisted = 900000
        h.timer.initialize()
        h.active = true
        runCurrent()
        assertEquals(0L, h.persisted)
        assertEquals(0L, h.timer.remaining.value)
        assertEquals(0, h.stops)
    }

    @Test
    fun failedCancellationLeavesRuntimeStoppedAndReportsNoFalseConfirmation() = runTest {
        val h = Harness(this)
        h.timer.set(15)
        h.saveFails = true
        assertFalse(h.timer.set(0))
        assertEquals("set", h.notices.last().action)
        h.timer.cancel()
        runCurrent()
        assertEquals(0L, h.timer.remaining.value)
        advanceTimeBy(1000000)
        runCurrent()
        assertEquals(0, h.stops)
        // The original persisted value remains, to be cleared on a later successful initialization.
        assertEquals(900000L, h.persisted)
    }
}
