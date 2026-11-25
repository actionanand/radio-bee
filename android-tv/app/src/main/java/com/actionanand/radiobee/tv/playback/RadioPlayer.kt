package com.actionanand.radiobee.tv.playback

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer

/** Media3 owns a playback-scoped CPU lock; this never requests a screen or Wi-Fi lock. */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
internal fun createRadioPlayer(context: Context): ExoPlayer =
    ExoPlayer.Builder(context).setWakeMode(C.WAKE_MODE_LOCAL).build().apply {
        setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build(),
            true,
        )
        setHandleAudioBecomingNoisy(true)
        playWhenReady = false
    }
