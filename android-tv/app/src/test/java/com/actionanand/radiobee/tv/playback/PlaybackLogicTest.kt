package com.actionanand.radiobee.tv.playback

import com.actionanand.radiobee.tv.data.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class PlaybackLogicTest {
    private val catalog =
        CatalogParser("https://actionanand.github.io/radio-bee-data/v2/").parse(fixture())
    private val station = catalog.stations.first()
    private val candidate = station.streams.first()

    @Test
    fun allEightPolicyCombinationsPreserveRestrictionsAndRights() {
        for (allow in listOf(false, true)) for (verification in listOf(false, true)) for (rights in
            listOf(false, true)) {
            val p = PlaybackPolicy(allow, verification, rights)
            val test =
                station.copy(
                    streams =
                        listOf(
                            candidate.copy(
                                verification = "unverified",
                                rights = "unconfirmed",
                                directStatus = "needs-review",
                            )
                        )
                )
            assertEquals(allow && !rights, p.eligible(test).isNotEmpty())
            assertTrue(
                p.eligible(test.copy(streams = listOf(candidate.copy(directStatus = "restricted"))))
                    .isEmpty()
            )
            assertTrue(
                p.eligible(
                        test.copy(
                            streams =
                                listOf(
                                    candidate.copy(
                                        verification = "verified",
                                        rights = "permission-granted",
                                        directStatus = "allowed",
                                    )
                                )
                        )
                    )
                    .isNotEmpty()
            )
        }
    }

    @Test
    fun unavailableVerificationFollowsConfiguredPolicy() {
        val test =
            station.copy(
                streams =
                    listOf(
                        candidate.copy(verification = "unavailable", directStatus = "needs-review")
                    )
            )
        assertTrue(PlaybackPolicy().eligible(test).isNotEmpty())
        assertTrue(PlaybackPolicy(checkVerification = true).eligible(test).isEmpty())
    }

    @Test
    fun invalidUrlsFormatsAndDiscoveryNeverBecomePlayable() {
        for (stream in
            listOf(
                candidate.copy(url = "javascript:bad"),
                candidate.copy(url = "http://example.com"),
                candidate.copy(url = "https://user:pass@example.com"),
                candidate.copy(format = "video"),
            )) assertTrue(
            PlaybackPolicy().eligible(station.copy(streams = listOf(stream))).isEmpty()
        )
        assertTrue(PlaybackPolicy().eligible(station.copy(discovery = true)).isEmpty())
    }

    @Test
    fun explicitHttpOptInStillPreservesRestrictions() {
        val test =
            station.copy(
                streams =
                    listOf(
                        candidate.copy(url = "http://example.com/live", directStatus = "allowed")
                    )
            )
        assertTrue(PlaybackPolicy(allowHttp = true).eligible(test).isNotEmpty())
        assertTrue(
            PlaybackPolicy(allowHttp = true)
                .eligible(
                    test.copy(
                        streams = listOf(test.streams.first().copy(directStatus = "restricted"))
                    )
                )
                .isEmpty()
        )
    }

    @Test
    fun pauseStopAndStationSwitchInvalidatePendingRecovery() {
        val epoch = PlaybackEpoch()
        val old = epoch.current()
        epoch.cancel()
        assertFalse(epoch.accepts(old))
        val next = epoch.current()
        assertTrue(epoch.accepts(next))
        epoch.cancel()
        assertFalse(epoch.accepts(next))
    }

    @Test
    fun singleUrlRetriesAreBoundedAndBackOff() {
        val budget = RetryBudget()
        budget.begin(listOf(candidate))
        assertEquals(500L, budget.next(candidate.url, true)!!.delayMs)
        assertEquals(1000L, budget.next(candidate.url, true)!!.delayMs)
        assertNull(budget.next(candidate.url, true))
    }

    @Test
    fun permanentFailureUsesOnlyFreshAlternative() {
        val budget = RetryBudget()
        budget.begin(
            listOf(candidate, candidate.copy(id = "other", url = "https://example.com/other"))
        )
        val next = budget.next(candidate.url, false)!!
        assertEquals(0L, next.delayMs)
        assertNull(budget.next(next.stream.url, false))
    }

    @Test
    fun urlsAreDeduplicatedAndNewSelectionResetsBudget() {
        val budget = RetryBudget()
        budget.begin(listOf(candidate, candidate))
        assertNull(budget.next(candidate.url, false))
        assertEquals(candidate, budget.begin(listOf(candidate)))
        assertNotNull(budget.next(candidate.url, true))
    }

    @Test
    fun sleepExpiresWithNoVisibleUi() = runTest {
        var stops = 0
        val timer = SleepTimer(backgroundScope, { testScheduler.currentTime }) { stops++ }
        timer.replace(15000)
        advanceTimeBy(15000)
        runCurrent()
        assertEquals(1, stops)
        assertEquals(0L, timer.remaining.value)
    }

    @Test
    fun timerReplacementCancelsTheOldDeadline() = runTest {
        var stops = 0
        val timer = SleepTimer(backgroundScope, { testScheduler.currentTime }) { stops++ }
        timer.replace(1000)
        advanceTimeBy(500)
        timer.replace(2500)
        advanceTimeBy(500)
        runCurrent()
        assertEquals(0, stops)
        advanceTimeBy(1500)
        runCurrent()
        assertEquals(1, stops)
    }

    @Test
    fun timerCancellationAndExpiredRestore() = runTest {
        var stops = 0
        val timer = SleepTimer(backgroundScope, { testScheduler.currentTime + 10000 }) { stops++ }
        timer.replace(12000)
        timer.cancel()
        advanceTimeBy(3000)
        assertEquals(0, stops)
        timer.replace(1000)
        runCurrent()
        assertEquals(1, stops)
    }

    @Test
    fun stalledStartupHasOneBoundedDeadline() = runTest {
        var retries = 0
        val deadline = BufferingDeadline(backgroundScope) { retries++ }
        deadline.arm()
        runCurrent()
        advanceTimeBy(20_000)
        deadline.arm()
        advanceTimeBy(10_000)
        runCurrent()
        assertEquals(1, retries)
        advanceTimeBy(60_000)
        runCurrent()
        assertEquals(1, retries)
    }

    @Test
    fun readyPauseStopAndSwitchCancelBufferingRecovery() = runTest {
        for (boundary in listOf("ready", "pause", "stop", "switch", "audio-focus-loss")) {
            var retries = 0
            val deadline = BufferingDeadline(backgroundScope) { retries++ }
            deadline.arm()
            runCurrent()
            advanceTimeBy(5000)
            deadline.cancel()
            advanceTimeBy(30_000)
            runCurrent()
            assertEquals(boundary, 0, retries)
        }
    }

    @Test
    fun aNewBufferingEpisodeGetsANewDeadline() = runTest {
        var retries = 0
        val deadline = BufferingDeadline(backgroundScope) { retries++ }
        deadline.arm()
        runCurrent()
        advanceTimeBy(1000)
        deadline.cancel()
        deadline.arm()
        runCurrent()
        advanceTimeBy(30_000)
        runCurrent()
        assertEquals(1, retries)
    }
}
