package com.actionanand.radiobee.tv.playback

import android.Manifest
import android.content.pm.PackageManager
import android.os.PowerManager
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.SilenceMediaSource
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.atomic.AtomicBoolean
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/**
 * Synthetic media tests only SDK wake ownership, not live station playback or television standby.
 */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class PlaybackWakeLockTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun media3ReleasesItsCpuLockOnPauseStopAndRelease() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals(
            PackageManager.PERMISSION_GRANTED,
            context.checkSelfPermission(Manifest.permission.WAKE_LOCK),
        )
        lateinit var player: ExoPlayer
        val playing = AtomicBoolean(false)
        var released = false
        compose.runOnIdle {
            player = createRadioPlayer(context)
            player.addListener(
                object : Player.Listener {
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        playing.set(isPlaying)
                    }
                }
            )
        }
        try {
            compose.waitUntil(5000) { !held(player) }
            fun start() {
                compose.runOnIdle {
                    player.setMediaSource(
                        SilenceMediaSource.Factory().setDurationUs(60_000_000).createMediaSource()
                    )
                    player.prepare()
                    player.play()
                }
                compose.waitUntil(5000) { playing.get() && held(player) }
            }
            start()
            compose.runOnIdle { player.pause() }
            compose.waitUntil(5000) { !held(player) }
            compose.runOnIdle { player.play() }
            compose.waitUntil(5000) { playing.get() && held(player) }
            compose.runOnIdle { player.stop() }
            compose.waitUntil(5000) { !held(player) }
            start()
            compose.runOnIdle {
                player.release()
                released = true
            }
            compose.waitUntil(5000) { !held(player) }
        } finally {
            if (!released) compose.runOnIdle { player.release() }
        }
    }

    // Read-only inspection of pinned Media3 1.9.4 internals; no production reflection or custom
    // lock.
    private fun held(player: ExoPlayer): Boolean {
        fun field(owner: Any, name: String): Any? =
            owner.javaClass.getDeclaredField(name).apply { isAccessible = true }.get(owner)
        val manager = checkNotNull(field(player, "wakeLockManager"))
        val internal = checkNotNull(field(manager, "wakeLockManagerInternal"))
        return synchronized(internal) {
            (field(internal, "wakeLock") as? PowerManager.WakeLock)?.isHeld == true
        }
    }
}
