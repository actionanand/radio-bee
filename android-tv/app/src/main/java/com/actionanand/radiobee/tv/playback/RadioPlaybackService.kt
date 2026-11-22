package com.actionanand.radiobee.tv.playback

import android.content.Intent
import android.os.Bundle
import androidx.core.net.toUri
import androidx.media3.common.*
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.*
import com.actionanand.radiobee.tv.RadioBeeApplication
import com.actionanand.radiobee.tv.data.*
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collectLatest

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class RadioPlaybackService : MediaSessionService() {
    companion object {
        const val TUNE = "radiobee.TUNE"
        const val SLEEP = "radiobee.SLEEP"
    }

    private val graph
        get() = (application as RadioBeeApplication).graph

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var player: ExoPlayer
    private var session: MediaSession? = null
    private var selection: String? = null
    private var selectedUrl: String? = null
    private val epoch = PlaybackEpoch()
    private var pending: Job? = null
    private val budget = RetryBudget()
    private lateinit var timer: SleepTimer
    private val bufferingDeadline =
        BufferingDeadline(scope) {
            if (
                player.playWhenReady &&
                    player.playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE
            )
                recover(true)
        }

    override fun onCreate() {
        super.onCreate()
        player =
            ExoPlayer.Builder(this).build().apply {
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
        timer =
            SleepTimer(scope) {
                stopPlayback()
                graph.scope.launch { graph.preferences.setSleep(0) }
            }
        scope.launch { timer.remaining.collect { graph.sleepRemaining.value = it } }
        scope.launch { graph.preferences.state.collectLatest { timer.replace(it.sleepUntil) } }
        val controlled =
            object : ForwardingPlayer(player) {
                override fun play() {
                    val station =
                        current()
                            ?: graph.catalog.state.value.catalog
                                ?.byId
                                ?.get(graph.preferences.state.value.lastStation)
                            ?: return
                    if (player.playbackState == Player.STATE_IDLE || player.playerError != null)
                        tune(station.id)
                    else if (allowed()) {
                        player.play()
                        if (player.playbackState == Player.STATE_BUFFERING) bufferingDeadline.arm()
                    }
                }

                override fun pause() {
                    invalidate()
                    player.pause()
                    publish("paused")
                }

                override fun stop() {
                    stopPlayback()
                }

                override fun setPlayWhenReady(playWhenReady: Boolean) {
                    if (playWhenReady) play() else pause()
                }
            }
        session =
            MediaSession.Builder(this, controlled)
                .setCallback(
                    object : MediaSession.Callback {
                        override fun onConnect(
                            session: MediaSession,
                            controller: MediaSession.ControllerInfo,
                        ): MediaSession.ConnectionResult {
                            val own = ownController(controller)
                            if (!own && !controller.isTrusted)
                                return MediaSession.ConnectionResult.reject()
                            val commands =
                                MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                                    .apply {
                                        if (own) {
                                            add(SessionCommand(TUNE, Bundle.EMPTY))
                                            add(SessionCommand(SLEEP, Bundle.EMPTY))
                                        }
                                    }
                                    .build()
                            val players =
                                MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
                                    .remove(Player.COMMAND_SET_MEDIA_ITEM)
                                    .remove(Player.COMMAND_CHANGE_MEDIA_ITEMS)
                                    .remove(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
                                    .build()
                            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                                .setAvailableSessionCommands(commands)
                                .setAvailablePlayerCommands(players)
                                .build()
                        }

                        override fun onCustomCommand(
                            session: MediaSession,
                            controller: MediaSession.ControllerInfo,
                            command: SessionCommand,
                            args: Bundle,
                        ): ListenableFuture<SessionResult> {
                            if (!ownController(controller))
                                return Futures.immediateFuture(
                                    SessionResult(SessionError.ERROR_PERMISSION_DENIED)
                                )
                            val accepted =
                                when (command.customAction) {
                                    TUNE -> tune(args.getString("stationId") ?: "")
                                    SLEEP -> {
                                        val minutes = args.getInt("minutes", -1)
                                        if (minutes in 0..240) {
                                            graph.scope.launch {
                                                graph.preferences.setSleep(
                                                    if (minutes == 0) 0
                                                    else
                                                        System.currentTimeMillis() +
                                                            minutes * 60000L
                                                )
                                            }
                                            true
                                        } else false
                                    }
                                    else -> false
                                }
                            return Futures.immediateFuture(
                                SessionResult(
                                    if (accepted) SessionResult.RESULT_SUCCESS
                                    else SessionError.ERROR_BAD_VALUE
                                )
                            )
                        }
                    }
                )
                .build()
        player.addListener(
            object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    if (isPlaying && allowed()) {
                        publish("playing")
                        selection?.let { id -> graph.scope.launch { graph.preferences.played(id) } }
                    } else if (player.playbackState == Player.STATE_READY && !player.playWhenReady)
                        publish("paused")
                }

                override fun onPlaybackSuppressionReasonChanged(reason: Int) {
                    if (reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
                        invalidate()
                        publish("paused")
                    } else if (
                        player.playWhenReady && player.playbackState == Player.STATE_BUFFERING
                    )
                        bufferingDeadline.arm()
                }

                override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                    if (
                        !playWhenReady &&
                            reason in
                                setOf(
                                    Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS,
                                    Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY,
                                )
                    ) {
                        invalidate()
                        publish("paused")
                    }
                }

                override fun onPlaybackStateChanged(state: Int) {
                    if (state != player.playbackState) return
                    when (state) {
                        Player.STATE_BUFFERING -> {
                            publish("buffering")
                            if (
                                player.playWhenReady &&
                                    player.playbackSuppressionReason ==
                                        Player.PLAYBACK_SUPPRESSION_REASON_NONE
                            )
                                bufferingDeadline.arm()
                        }
                        Player.STATE_READY -> bufferingDeadline.cancel()
                        Player.STATE_ENDED -> recover(true)
                        Player.STATE_IDLE -> if (pending == null) publish("idle")
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    if (
                        player.playerError !== error ||
                            player.currentMediaItem?.mediaId != selection
                    )
                        return
                    var cause: Throwable? = error
                    var response: Int? = null
                    while (cause != null) {
                        if (cause is HttpDataSource.InvalidResponseCodeException)
                            response = cause.responseCode
                        cause = cause.cause
                    }
                    val transient =
                        if (response != null) response == 408 || response == 429 || response >= 500
                        else
                            error.errorCode in
                                setOf(
                                    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                                    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
                                    PlaybackException.ERROR_CODE_TIMEOUT,
                                    PlaybackException.ERROR_CODE_IO_UNSPECIFIED,
                                )
                    recover(transient)
                }
            }
        )
        scope.launch {
            graph.catalog.state.collect { state ->
                if (state.catalog != null && selection != null && !allowed()) {
                    stopPlayback()
                    publish("unavailable", true)
                }
            }
        }
    }

    private fun ownController(controller: MediaSession.ControllerInfo): Boolean {
        if (controller.uid != applicationInfo.uid) return false
        return controller.packageName == packageName
    }

    private fun current() = graph.catalog.state.value.catalog?.byId?.get(selection)

    private fun allowed() =
        current()?.let {
            graph.policy.eligible(it).any { candidate -> candidate.url == selectedUrl }
        } ?: false

    private fun invalidate() {
        bufferingDeadline.cancel()
        epoch.cancel()
        pending?.cancel()
        pending = null
    }

    private fun tune(id: String): Boolean {
        val station = graph.catalog.state.value.catalog?.byId?.get(id) ?: return false
        val stream =
            budget.begin(graph.policy.eligible(station))
                ?: run {
                    invalidate()
                    player.stop()
                    player.clearMediaItems()
                    selection = id
                    selectedUrl = null
                    publish("unavailable", true)
                    return false
                }
        invalidate()
        selection = id
        selectedUrl = stream.url
        graph.scope.launch { graph.preferences.select(id) }
        load(station, stream)
        return true
    }

    private fun load(station: Station, stream: Stream) {
        if (!graph.policy.eligible(station).any { it.url == stream.url }) {
            stopPlayback()
            publish("unavailable", true)
            return
        }
        selectedUrl = stream.url
        val network =
            graph.catalog.state.value.catalog?.networks?.get(station.networkId)?.name.orEmpty()
        val artwork =
            graph.catalog.state.value.catalog?.artwork(station)?.firstOrNull()
                ?: "android.resource://$packageName/drawable/radiobee_logo"
        val media =
            MediaItem.Builder()
                .setMediaId(station.id)
                .setUri(stream.url)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(station.name)
                        .setArtist(network)
                        .setArtworkUri(artwork.toUri())
                        .setIsPlayable(true)
                        .build()
                )
                .apply { if (stream.format == "hls") setMimeType(MimeTypes.APPLICATION_M3U8) }
                .build()
        player.setMediaItem(media)
        player.prepare()
        player.play()
        bufferingDeadline.arm()
        publish("buffering")
    }

    private fun recover(transient: Boolean) {
        if (
            pending?.isActive == true ||
                !player.playWhenReady ||
                player.playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE
        )
            return
        val station = current() ?: return
        if (!allowed()) {
            stopPlayback()
            publish("unavailable", true)
            return
        }
        val step = budget.next(selectedUrl ?: "", transient)
        invalidate()
        if (step == null) {
            player.stop()
            publish("failed", true)
            return
        }
        player.stop()
        val token = epoch.current()
        publish("reconnecting")
        pending = scope.launch {
            delay(step.delayMs)
            if (
                epoch.accepts(token) &&
                    allowed() &&
                    player.playWhenReady &&
                    player.playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE
            ) {
                pending = null
                load(station, step.stream)
            }
        }
    }

    private fun publish(status: String, error: Boolean = false) {
        graph.playback.value = PlaybackViewState(selection, status, error, budget.number())
    }

    private fun stopPlayback() {
        invalidate()
        player.stop()
        player.clearMediaItems()
        publish("idle")
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (!graph.preferences.state.value.background || !player.playWhenReady) {
            stopPlayback()
            stopSelf()
        }
    }

    override fun onDestroy() {
        invalidate()
        timer.cancel()
        scope.cancel()
        session?.release()
        session = null
        player.release()
        graph.sleepRemaining.value = 0
        super.onDestroy()
    }
}
