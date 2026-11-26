package com.actionanand.radiobee.tv.playback

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import com.actionanand.radiobee.tv.data.UserPreferences
import java.io.IOException
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FirstPlaybackGateTest {
    private class Store(initial: Preferences = emptyPreferences()) : DataStore<Preferences> {
        val values = MutableStateFlow(initial)
        override val data: Flow<Preferences> = values
        var fail = false
        var block: CompletableDeferred<Unit>? = null
        var writes = 0

        override suspend fun updateData(
            transform: suspend (Preferences) -> Preferences
        ): Preferences {
            block?.await()
            if (fail) throw IOException("disk full")
            val next = transform(values.value)
            values.value = next
            writes++
            return next
        }
    }

    private fun TestScope.setup(
        store: Store = Store()
    ): Triple<Store, UserPreferences, FirstPlaybackGate> {
        val preferences = UserPreferences(store, backgroundScope)
        return Triple(store, preferences, FirstPlaybackGate(preferences, backgroundScope))
    }

    @Test
    fun freshInstallDoesNotPromptUntilPlayIsRequested() = runTest {
        val (_, prefs, gate) = setup()
        runCurrent()
        assertTrue(prefs.state.value.loaded)
        assertFalse(prefs.state.value.backgroundConfigured)
        assertNull(gate.station.value)
        var plays = 0
        gate.request("original") { plays++ }
        runCurrent()
        assertEquals("original", gate.station.value)
        assertEquals(0, plays)
    }

    @Test
    fun eitherChoiceIsDurableBeforeExactlyOneOriginalPlayback() = runTest {
        for (choice in listOf(true, false)) {
            val (store, prefs, gate) = setup()
            var plays = 0
            gate.request("original") {
                assertEquals(choice, store.values.value[booleanPreferencesKey("background")])
                assertEquals(choice, prefs.state.value.background)
                plays++
            }
            runCurrent()
            gate.request("replacement") { fail("must keep original") }
            gate.choose(choice)
            gate.choose(!choice)
            runCurrent()
            assertEquals(1, plays)
            assertNull(gate.station.value)
            assertEquals(1, store.writes)
        }
    }

    @Test
    fun savedTrueAndFalsePreferencesNeverPromptAgain() = runTest {
        for (choice in listOf(true, false)) {
            val (_, _, gate) =
                setup(Store(preferencesOf(booleanPreferencesKey("background") to choice)))
            var plays = 0
            gate.request("station") { plays++ }
            runCurrent()
            assertNull(gate.station.value)
            assertEquals(1, plays)
        }
    }

    @Test
    fun dismissedPromptDoesNotPlayAndNextAttemptAsksAgain() = runTest {
        val (_, _, gate) = setup()
        var plays = 0
        gate.request("station") { plays++ }
        runCurrent()
        gate.cancel()
        gate.choose(true)
        runCurrent()
        assertNull(gate.station.value)
        assertEquals(0, plays)
        gate.request("station") { plays++ }
        runCurrent()
        assertEquals("station", gate.station.value)
        gate.choose(false)
        runCurrent()
        assertEquals(1, plays)
    }

    @Test
    fun failedSaveRetainsDialogAndNeverPlaysUntilRetrySucceeds() = runTest {
        val (store, prefs, gate) = setup()
        store.fail = true
        var plays = 0
        gate.request("station") { plays++ }
        runCurrent()
        gate.choose(true)
        runCurrent()
        assertEquals(0, plays)
        assertTrue(gate.error.value)
        assertTrue(prefs.writeError.value)
        assertFalse(gate.saving.value)
        assertEquals("station", gate.station.value)
        store.fail = false
        gate.choose(false)
        runCurrent()
        assertEquals(1, plays)
        assertFalse(gate.error.value)
    }

    @Test
    fun delayedSaveDoesNotStartAudioEarly() = runTest {
        val (store, _, gate) = setup()
        store.block = CompletableDeferred()
        var plays = 0
        gate.request("station") { plays++ }
        runCurrent()
        gate.choose(true)
        runCurrent()
        assertTrue(gate.saving.value)
        assertEquals(0, plays)
        store.block!!.complete(Unit)
        runCurrent()
        assertEquals(1, plays)
    }

    @Test
    fun stopDismissOrServiceDestructionDuringSaveInvalidatesCallback() = runTest {
        val (store, _, gate) = setup()
        store.block = CompletableDeferred()
        gate.request("station") { fail("cancelled playback callback") }
        runCurrent()
        gate.choose(true)
        runCurrent()
        gate.cancel()
        store.block!!.complete(Unit)
        runCurrent()
        assertNull(gate.station.value)
        assertFalse(gate.saving.value)
        assertEquals(true, store.values.value[booleanPreferencesKey("background")])
    }

    @Test
    fun cancelledPendingPreferenceReadCannotStartLater() = runTest {
        val (_, _, gate) = setup()
        gate.request("station") { fail("stale request") }
        gate.cancel()
        runCurrent()
        assertNull(gate.station.value)
    }

    @Test
    fun rapidRemoteCommandsBeforePreferenceLoadSelectOnlyLatestRequest() = runTest {
        val (_, _, gate) = setup(Store(preferencesOf(booleanPreferencesKey("background") to true)))
        gate.request("old") { fail("stale remote Play") }
        var plays = 0
        gate.request("new") { plays++ }
        runCurrent()
        assertEquals(1, plays)
    }

    @Test
    fun settingsChoiceBeforeFirstPlaybackSkipsPromptAndCanBeChanged() = runTest {
        val (_, prefs, gate) = setup()
        assertTrue(prefs.setBackground(false))
        runCurrent()
        var plays = 0
        gate.request("station") { plays++ }
        runCurrent()
        assertNull(gate.station.value)
        assertFalse(prefs.state.value.background)
        assertTrue(prefs.setBackground(true))
        runCurrent()
        gate.request("station") { plays++ }
        runCurrent()
        assertEquals(2, plays)
        assertTrue(prefs.state.value.background)
    }

    @Test
    fun graphOwnedPendingChoiceSurvivesUiReattachment() = runTest {
        val (_, _, gate) = setup()
        var plays = 0
        gate.request("station") { plays++ }
        runCurrent()
        // A recreated UI subscribes to the same app-owned gate, not a new playback callback.
        assertEquals("station", gate.station.first())
        gate.choose(true)
        runCurrent()
        assertEquals(1, plays)
        gate.request("station") { plays++ }
        runCurrent()
        assertNull(gate.station.value)
        assertEquals(2, plays)
    }

    @Test
    fun homeDuringDurableSaveNeverStartsRadioAfterLeavingEvenBeforeSettingsFlowUpdates() = runTest {
        for (choice in listOf(true, false)) {
            val (store, _, gate) = setup()
            store.block = CompletableDeferred()
            gate.request("station") { fail("late first Play after Home") }
            runCurrent()
            gate.choose(choice)
            runCurrent()
            // The old default may still be true while DataStore is writing the user's false choice.
            onAppBackgrounded(true, gate::cancel) { fail("no existing audio to pause") }
            store.block!!.complete(Unit)
            runCurrent()
            assertNull(gate.station.value)
            assertEquals(choice, store.values.value[booleanPreferencesKey("background")])
        }
    }
}
