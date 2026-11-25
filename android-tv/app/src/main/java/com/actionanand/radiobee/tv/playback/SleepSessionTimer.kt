package com.actionanand.radiobee.tv.playback

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class SleepNotice(val action: String, val minutes: Int = 0, val sequence: Long = 0)

/**
 * Serializes durable timer changes. The scheduler is session scoped, writes survive service
 * teardown.
 */
internal class SleepSessionTimer(
    private val schedulerScope: CoroutineScope,
    private val persistenceScope: CoroutineScope,
    private val read: suspend () -> Long,
    private val save: suspend (Long) -> Boolean,
    private val hasSession: () -> Boolean,
    private val notice: (SleepNotice) -> Unit,
    private val expire: () -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
    private val mutex: Mutex = Mutex(),
) {
    private var generation = 0
    private var closed = false
    private var deadline = 0L
    private var sequence = 0L
    private val timer =
        SleepTimer(schedulerScope, now) {
            cancel("expired")
            expire()
        }
    val remaining = timer.remaining

    fun initialize() {
        val existingSession = hasSession()
        persistenceScope.launch {
            mutex.withLock {
                val stored = read()
                if (closed) return@withLock
                // Never restore playback to satisfy a countdown from a dead process/session.
                if (stored > 0 && (stored <= now() || !existingSession)) save(0)
                else if (stored > 0) {
                    deadline = stored
                    timer.replace(stored)
                }
            }
        }
    }

    suspend fun set(minutes: Int): Boolean {
        if (minutes !in listOf(0, 15, 30, 45, 60) || closed) return false
        val token = generation
        return mutex.withLock {
            if (closed || token != generation || (minutes > 0 && !hasSession()))
                return@withLock false
            val next = if (minutes == 0) 0 else now() + minutes * 60000L
            val replacing = deadline > 0
            if (!save(next)) return@withLock false
            if (closed || token != generation) return@withLock false
            deadline = next
            timer.replace(next)
            notice(
                SleepNotice(
                    if (minutes == 0) "cancelled" else if (replacing) "replaced" else "set",
                    minutes,
                    ++sequence,
                )
            )
            true
        }
    }

    fun cancel(reason: String = "stopped") {
        ++generation
        val wasActive = deadline > 0
        deadline = 0
        timer.cancel()
        if (reason == "expired" || wasActive) notice(SleepNotice(reason, sequence = ++sequence))
        persistenceScope.launch { mutex.withLock { save(0) } }
    }

    fun close() {
        closed = true
        cancel()
    }
}
