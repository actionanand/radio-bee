package com.actionanand.radiobee.tv

import android.content.ComponentName
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.actionanand.radiobee.tv.playback.RadioPlaybackService
import com.actionanand.radiobee.tv.playback.StartedControllerConnection
import com.actionanand.radiobee.tv.playback.onAppBackgrounded
import com.actionanand.radiobee.tv.ui.RadioBeeTv

class MainActivity : ComponentActivity() {
    private var controller by mutableStateOf<MediaController?>(null)
    private var connectionError by mutableStateOf(false)
    private val graph
        get() = (application as RadioBeeApplication).graph

    private val connection by lazy {
        StartedControllerConnection(
            connect = {
                MediaController.Builder(
                        this,
                        SessionToken(this, ComponentName(this, RadioPlaybackService::class.java)),
                    )
                    .buildAsync()
            },
            release = MediaController::releaseFuture,
            connected = { controller = it },
            disconnected = { controller = null },
            failed = { connectionError = true },
            executor = ContextCompat.getMainExecutor(this),
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { RadioBeeTv(graph, controller, connectionError) }
    }

    override fun onStart() {
        super.onStart()
        connectionError = false
        connection.start()
    }

    override fun onStop() {
        onAppBackgrounded(graph.preferences.state.value.background) { controller?.pause() }
        connection.stop()
        super.onStop()
    }

    override fun onDestroy() {
        connection.stop()
        super.onDestroy()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                controller?.let { if (it.playWhenReady) it.pause() else it.play() }
                return true
            }
            KeyEvent.KEYCODE_MEDIA_PLAY -> {
                controller?.play()
                return true
            }
            KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                controller?.pause()
                return true
            }
            KeyEvent.KEYCODE_MEDIA_STOP -> {
                controller?.stop()
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }
}
