package com.actionanand.radiobee.tv.playback

import com.google.common.util.concurrent.SettableFuture
import java.util.concurrent.Executor
import org.junit.Assert.*
import org.junit.Test

class StartedControllerConnectionTest {
    private val direct = Executor { it.run() }

    @Test
    fun repeatedStartCreatesOnlyOneBinding() {
        var starts = 0
        val future = SettableFuture.create<String>()
        val connection =
            StartedControllerConnection(
                {
                    starts++
                    future
                },
                {},
                {},
                {},
                {},
                direct,
            )
        connection.start()
        connection.start()
        assertEquals(1, starts)
        connection.stop()
    }

    @Test
    fun stopReleasesPendingFutureAndIgnoresLateSuccess() {
        val future = SettableFuture.create<String>()
        val events = mutableListOf<String>()
        val connection =
            StartedControllerConnection(
                { future },
                { events.add("release") },
                { events.add(it) },
                { events.add("clear") },
                { error("Stale failure") },
                direct,
            )
        connection.start()
        connection.stop()
        future.set("late")
        assertEquals(listOf("clear", "release"), events)
    }

    @Test
    fun returningHomeCreatesFreshBindingAndIgnoresOldFailure() {
        val first = SettableFuture.create<String>()
        val second = SettableFuture.create<String>()
        var starts = 0
        val values = mutableListOf<String>()
        var failures = 0
        var releases = 0
        val connection =
            StartedControllerConnection(
                { if (starts++ == 0) first else second },
                { releases++ },
                { values.add(it) },
                {},
                { failures++ },
                direct,
            )
        connection.start()
        connection.stop()
        connection.start()
        first.setException(IllegalStateException("old connection"))
        second.set("new")
        assertEquals(listOf("new"), values)
        assertEquals(0, failures)
        connection.stop()
        assertEquals(2, releases)
    }

    @Test
    fun alreadyQueuedCompletionCannotRepopulateHiddenActivity() {
        val future = SettableFuture.create<String>()
        val queue = mutableListOf<Runnable>()
        val values = mutableListOf<String>()
        val connection =
            StartedControllerConnection(
                { future },
                {},
                { values.add(it) },
                {},
                { error("stale") },
                Executor { queue.add(it) },
            )
        connection.start()
        future.set("finished before Home")
        connection.stop()
        queue.forEach { it.run() }
        assertTrue(values.isEmpty())
    }

    @Test
    fun stopClearsUiBeforeReleaseAndIsIdempotent() {
        val future = SettableFuture.create<String>()
        val events = mutableListOf<String>()
        val connection =
            StartedControllerConnection(
                { future },
                { events.add("release") },
                { events.add(it) },
                { events.add("clear") },
                {},
                direct,
            )
        connection.start()
        future.set("connected")
        connection.stop()
        connection.stop()
        assertEquals(listOf("connected", "clear", "release"), events)
    }

    @Test
    fun currentConnectionFailureIsReportedAndReleasedOnStop() {
        val future = SettableFuture.create<String>()
        var errors = 0
        var releases = 0
        val connection =
            StartedControllerConnection({ future }, { releases++ }, {}, {}, { errors++ }, direct)
        connection.start()
        future.setException(IllegalStateException("failed"))
        assertEquals(1, errors)
        connection.stop()
        assertEquals(1, releases)
    }

    @Test
    fun synchronousFactoryFailureAllowsNextStartToRetry() {
        var starts = 0
        var errors = 0
        val future = SettableFuture.create<String>()
        val values = mutableListOf<String>()
        val connection =
            StartedControllerConnection(
                { if (starts++ == 0) throw IllegalStateException("first") else future },
                {},
                { values.add(it) },
                {},
                { errors++ },
                direct,
            )
        connection.start()
        connection.start()
        future.set("reconnected")
        assertEquals(1, errors)
        assertEquals(listOf("reconnected"), values)
        connection.stop()
    }
}
