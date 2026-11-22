package com.actionanand.radiobee.tv.playback

import com.actionanand.radiobee.tv.data.Stream
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PlaybackViewState(
    val stationId: String? = null,
    val status: String = "idle",
    val error: Boolean = false,
    val retryAttempt: Int = 0,
)

data class RetryStep(val stream: Stream, val delayMs: Long)

/** Limits are per user selection. Only confirmed playback can be remembered as recently played. */
class RetryBudget {
    private var candidates = emptyList<Stream>()
    private val attempts = mutableMapOf<String, Int>()
    private var total = 0

    fun begin(streams: List<Stream>): Stream? {
        candidates = streams.distinctBy { it.url }.take(3)
        attempts.clear()
        total = 0
        return candidates.firstOrNull()?.also { record(it) }
    }

    private fun record(stream: Stream) {
        attempts[stream.url] = (attempts[stream.url] ?: 0) + 1
        ++total
    }

    fun next(failedUrl: String, transient: Boolean): RetryStep? {
        if (total >= 6) return null
        val fresh = candidates.firstOrNull { it.url !in attempts }
        val repeat =
            if (transient)
                candidates.firstOrNull { it.url == failedUrl && (attempts[it.url] ?: 0) < 3 }
            else null
        val next = fresh ?: repeat ?: return null
        val delay =
            if (next.url !in attempts) 0
            else (500L shl ((attempts[next.url] ?: 1) - 1)).coerceAtMost(8000)
        record(next)
        return RetryStep(next, delay)
    }

    fun number() = total
}

class SleepTimer(
    private val scope: CoroutineScope,
    private val now: () -> Long = System::currentTimeMillis,
    private val expire: () -> Unit,
) {
    private var job: Job? = null
    private val mutable = MutableStateFlow(0L)
    val remaining = mutable.asStateFlow()

    fun replace(deadline: Long) {
        job?.cancel()
        job = null
        if (deadline <= 0) {
            mutable.value = 0
            return
        }
        job = scope.launch {
            while (isActive) {
                val left = (deadline - now()).coerceAtLeast(0)
                mutable.value = left
                if (left == 0L) {
                    expire()
                    break
                }
                delay(minOf(left, 1000))
            }
        }
    }

    fun cancel() {
        job?.cancel()
        job = null
        mutable.value = 0
    }
}

/** Cancellation boundary shared by Pause, Stop, station switching and delayed recovery. */
class PlaybackEpoch {
    private var value = 0

    fun cancel() {
        ++value
    }

    fun current() = value

    fun accepts(token: Int) = token == value
}

/**
 * One deadline per buffering episode; callers cancel on Ready, Pause, Stop and selection changes.
 */
class BufferingDeadline(private val scope: CoroutineScope, private val expired: () -> Unit) {
    private var job: Job? = null

    fun arm() {
        if (job?.isActive == true) return
        job = scope.launch {
            delay(30_000)
            job = null
            expired()
        }
    }

    fun cancel() {
        job?.cancel()
        job = null
    }
}
