package com.actionanand.radiobee.tv.ui

import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.*
import androidx.compose.ui.*
import androidx.compose.ui.focus.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.*
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.session.*
import androidx.tv.material3.*
import com.actionanand.radiobee.tv.*
import com.actionanand.radiobee.tv.R
import com.actionanand.radiobee.tv.data.*
import com.actionanand.radiobee.tv.playback.RadioPlaybackService
import java.util.Locale
import kotlinx.coroutines.launch

private val Ink = Color(0xFFEAF3E7)
private val Accent = Color(0xFFB9E79D)
private val Background = Color(0xFF0B1714)
private val Panel = Color(0xFF19392F)

private data class Choice(
    val title: String,
    val values: List<Named>,
    val current: String,
    val selected: (String) -> Unit,
)

@Composable
fun RadioBeeTv(graph: AppGraph, controller: MediaController?, connectionError: Boolean) {
    val preferences by graph.preferences.state.collectAsStateWithLifecycle()
    val state by graph.catalog.state.collectAsStateWithLifecycle()
    val playback by graph.playback.collectAsStateWithLifecycle()
    val remaining by graph.sleepRemaining.collectAsStateWithLifecycle()
    val firstStation by graph.firstPlayback.station.collectAsStateWithLifecycle()
    val savingChoice by graph.firstPlayback.saving.collectAsStateWithLifecycle()
    val choiceError by graph.firstPlayback.error.collectAsStateWithLifecycle()
    val sleepNotice by graph.sleepNotice.collectAsStateWithLifecycle()
    val storageError by graph.preferences.writeError.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val baseConfiguration = LocalConfiguration.current
    val config =
        remember(preferences.locale, baseConfiguration) {
            Configuration(baseConfiguration).apply {
                setLocale(Locale.forLanguageTag(preferences.locale))
            }
        }
    val localized = remember(config) { context.createConfigurationContext(config) }
    CompositionLocalProvider(LocalContext provides localized, LocalConfiguration provides config) {
        MaterialTheme(
            colorScheme =
                darkColorScheme(
                    primary = Accent,
                    onPrimary = Background,
                    background = Background,
                    onBackground = Ink,
                    surface = Panel,
                    onSurface = Ink,
                )
        ) {
            val scope = rememberCoroutineScope()
            val saved = rememberSaveableStateHolder()
            var page by rememberSaveable { mutableStateOf("home") }
            var returnPage by rememberSaveable { mutableStateOf("home") }
            var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
            var restoreKey by rememberSaveable { mutableStateOf<String?>(null) }
            var query by rememberSaveable { mutableStateOf("") }
            var language by rememberSaveable { mutableStateOf("") }
            var country by rememberSaveable { mutableStateOf("") }
            var network by rememberSaveable { mutableStateOf("") }
            var genre by rememberSaveable { mutableStateOf("") }
            var broadcaster by rememberSaveable { mutableStateOf("") }
            var choice by remember { mutableStateOf<Choice?>(null) }
            var legal by remember { mutableStateOf(false) }
            var cacheCleared by remember { mutableStateOf(false) }
            val c = state.catalog
            val playFocus = remember { FocusRequester() }
            var hadPrompt by remember { mutableStateOf(false) }
            LaunchedEffect(firstStation) {
                if (firstStation != null) hadPrompt = true
                else if (hadPrompt) {
                    withFrameNanos {}
                    runCatching { playFocus.requestFocus() }
                    hadPrompt = false
                }
            }
            val timerLabel = stringResource(R.string.sleep)
            val timerOptions =
                listOf(Named("0", stringResource(R.string.cancel_sleep))) +
                    listOf(15, 30, 45, 60).map {
                        Named(it.toString(), pluralStringResource(R.plurals.minutes, it, it))
                    }
            val hasSession =
                controller != null &&
                    controller.mediaItemCount > 0 &&
                    playback.stationId != null &&
                    playback.status in listOf("playing", "paused", "buffering", "reconnecting")

            fun tune(id: String) {
                controller?.sendCustomCommand(
                    SessionCommand(RadioPlaybackService.TUNE, Bundle.EMPTY),
                    Bundle().apply { putString("stationId", id) },
                )
            }
            fun sleep(minutes: Int) {
                controller?.sendCustomCommand(
                    SessionCommand(RadioPlaybackService.SLEEP, Bundle.EMPTY),
                    Bundle().apply { putInt("minutes", minutes) },
                )
            }
            fun chooseSleep() {
                choice = Choice(timerLabel, timerOptions, "") { sleep(it.toInt()) }
            }
            fun openStation(station: Station) {
                returnPage = page
                selectedId = station.id
                page = "player"
                if (graph.policy.eligible(station).isNotEmpty()) tune(station.id)
            }
            fun reset() {
                query = ""
                language = ""
                country = ""
                network = ""
                genre = ""
                broadcaster = ""
            }
            BackHandler(page != "home" && choice == null && !legal && firstStation == null) {
                page = if (page == "player") returnPage else "home"
            }
            Column(
                Modifier.fillMaxSize()
                    .background(Background)
                    .padding(horizontal = 32.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(R.string.app_name),
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Bold,
                        color = Accent,
                    )
                    Spacer(Modifier.width(20.dp))
                    Text(stringResource(R.string.tagline), fontSize = 16.sp, color = Ink)
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.focusGroup(),
                ) {
                    for ((key, label) in
                        listOf(
                            "home" to R.string.home,
                            "browse" to R.string.browse,
                            "player" to R.string.now_playing,
                            "settings" to R.string.settings,
                        )) {
                        Button(
                            onClick = {
                                if (key == "player")
                                    selectedId = playback.stationId ?: preferences.lastStation
                                page = key
                            },
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) {
                            Text(stringResource(label), fontSize = 16.sp)
                        }
                    }
                }
                if (connectionError)
                    Text(
                        stringResource(R.string.connection_error),
                        color = Ink,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                if (storageError)
                    Text(
                        stringResource(R.string.storage_error),
                        color = Accent,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                if (sleepNotice.action.isNotEmpty()) {
                    val message =
                        when (sleepNotice.action) {
                            "set",
                            "replaced" ->
                                stringResource(
                                    if (sleepNotice.action == "set") R.string.sleep_set
                                    else R.string.sleep_replaced,
                                    pluralStringResource(
                                        R.plurals.minutes,
                                        sleepNotice.minutes,
                                        sleepNotice.minutes,
                                    ),
                                )
                            "expired" -> stringResource(R.string.sleep_expired)
                            "stopped" -> stringResource(R.string.sleep_stopped)
                            else -> stringResource(R.string.sleep_cancelled)
                        }
                    Text(
                        message,
                        color = Accent,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
                if (state.error)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            stringResource(R.string.catalog_error),
                            modifier = Modifier.weight(1f),
                            fontSize = 16.sp,
                        )
                        Button(
                            onClick = { scope.launch { graph.catalog.refresh() } },
                            enabled = !state.loading,
                        ) {
                            Text(stringResource(R.string.retry))
                        }
                    }
                if (state.loading && c == null)
                    Text(stringResource(R.string.loading), modifier = Modifier.weight(1f))
                else
                    Box(Modifier.weight(1f).fillMaxWidth()) {
                        saved.SaveableStateProvider(page) {
                            when (page) {
                                "home" -> {
                                    val rows = mutableListOf<Pair<String, List<Station>>>()
                                    if (c != null) {
                                        rows +=
                                            stringResource(R.string.featured) to
                                                c.featured.mapNotNull(c.byId::get)
                                        rows +=
                                            stringResource(R.string.favorites) to
                                                preferences.favorites.mapNotNull(c.byId::get)
                                        rows +=
                                            stringResource(R.string.recent) to
                                                preferences.recent.mapNotNull(c.byId::get)
                                        rows +=
                                            stringResource(R.string.tamil_fm) to
                                                c.stations.filter { "ta" in it.languages }
                                        rows +=
                                            stringResource(R.string.devotional) to c.devotional()
                                        for (l in c.languages.filter { it.id != "ta" }) {
                                            val stations =
                                                c.stations.filter { l.id in it.languages }
                                            if (stations.isNotEmpty()) rows += l.name to stations
                                        }
                                    }
                                    LazyColumn(
                                        verticalArrangement = Arrangement.spacedBy(20.dp),
                                        modifier = Modifier.fillMaxSize().focusRestorer(),
                                    ) {
                                        item {
                                            Button(
                                                onClick = {
                                                    reset()
                                                    page = "browse"
                                                }
                                            ) {
                                                Text(stringResource(R.string.discover))
                                            }
                                        }
                                        items(
                                            rows.filter { it.second.isNotEmpty() },
                                            key = { it.first },
                                        ) { (title, stations) ->
                                            Column {
                                                Text(
                                                    title,
                                                    fontSize = 23.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                )
                                                StationRow(
                                                    stations,
                                                    c!!,
                                                    preferences.locale,
                                                    preferences.favorites,
                                                    { station ->
                                                        restoreKey = "home/$title/${station.id}"
                                                        openStation(station)
                                                    },
                                                    restoreKey,
                                                    "home/$title",
                                                )
                                            }
                                        }
                                    }
                                }
                                "browse" ->
                                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                        val searchLabel = stringResource(R.string.search)
                                        Text(searchLabel, fontSize = 23.sp)
                                        BasicTextField(
                                            value = query,
                                            onValueChange = { query = it },
                                            singleLine = true,
                                            textStyle = TextStyle(color = Ink, fontSize = 20.sp),
                                            modifier =
                                                Modifier.fillMaxWidth()
                                                    .heightIn(min = 56.dp)
                                                    .background(Panel, RoundedCornerShape(8.dp))
                                                    .padding(14.dp)
                                                    .semantics { contentDescription = searchLabel },
                                        )
                                        if (c != null) {
                                            val allLabel = stringResource(R.string.all)
                                            val groups =
                                                listOf(
                                                    Triple(
                                                        stringResource(R.string.language),
                                                        c.languages.filter { l ->
                                                            c.stations.any { l.id in it.languages }
                                                        },
                                                        "language",
                                                    ),
                                                    Triple(
                                                        stringResource(R.string.country),
                                                        c.stations
                                                            .map { it.country }
                                                            .distinct()
                                                            .map { code ->
                                                                Named(
                                                                    code,
                                                                    c.places.values
                                                                        .find {
                                                                            it.country == code &&
                                                                                it.type == "country"
                                                                        }
                                                                        ?.name ?: code,
                                                                )
                                                            },
                                                        "country",
                                                    ),
                                                    Triple(
                                                        stringResource(R.string.network),
                                                        c.networks.values
                                                            .filter { n ->
                                                                c.stations.any {
                                                                    it.networkId == n.id
                                                                }
                                                            }
                                                            .map { Named(it.id, it.name) },
                                                        "network",
                                                    ),
                                                    Triple(
                                                        stringResource(R.string.broadcaster),
                                                        c.broadcasters.filter { b ->
                                                            c.stations.any {
                                                                c.networks[it.networkId]
                                                                    ?.broadcasterId == b.id
                                                            }
                                                        },
                                                        "broadcaster",
                                                    ),
                                                    Triple(
                                                        stringResource(R.string.category),
                                                        c.genres.filter { g ->
                                                            c.stations.any { g.id in it.genres }
                                                        },
                                                        "genre",
                                                    ),
                                                )
                                            LazyRow(
                                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                                contentPadding = PaddingValues(8.dp),
                                                modifier = Modifier.focusRestorer().focusGroup(),
                                            ) {
                                                items(groups, key = { it.third }) {
                                                    (title, values, key) ->
                                                    val current =
                                                        when (key) {
                                                            "language" -> language
                                                            "country" -> country
                                                            "network" -> network
                                                            "broadcaster" -> broadcaster
                                                            else -> genre
                                                        }
                                                    Button(
                                                        onClick = {
                                                            choice =
                                                                Choice(
                                                                    title,
                                                                    listOf(Named("", allLabel)) +
                                                                        values,
                                                                    current,
                                                                ) { value ->
                                                                    when (key) {
                                                                        "language" ->
                                                                            language = value
                                                                        "country" -> country = value
                                                                        "network" -> network = value
                                                                        "broadcaster" ->
                                                                            broadcaster = value
                                                                        else -> genre = value
                                                                    }
                                                                }
                                                        }
                                                    ) {
                                                        Text(
                                                            title +
                                                                ": " +
                                                                (values
                                                                    .find { it.id == current }
                                                                    ?.name ?: allLabel),
                                                            maxLines = 1,
                                                        )
                                                    }
                                                }
                                                item {
                                                    Button(onClick = ::reset) {
                                                        Text(stringResource(R.string.reset))
                                                    }
                                                }
                                            }
                                            val stations =
                                                c.search(
                                                    query,
                                                    language,
                                                    country,
                                                    network,
                                                    genre,
                                                    broadcaster,
                                                )
                                            if (stations.isEmpty())
                                                Text(stringResource(R.string.no_results))
                                            LazyColumn(
                                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                                modifier = Modifier.fillMaxSize().focusRestorer(),
                                            ) {
                                                items(
                                                    stations.chunked(4),
                                                    key = { it.first().id },
                                                ) {
                                                    StationRow(
                                                        it,
                                                        c,
                                                        preferences.locale,
                                                        preferences.favorites,
                                                        { station ->
                                                            restoreKey =
                                                                "browse/${it.first().id}/${station.id}"
                                                            openStation(station)
                                                        },
                                                        restoreKey,
                                                        "browse/${it.first().id}",
                                                    )
                                                }
                                            }
                                        }
                                    }
                                "player" -> {
                                    val station =
                                        c?.byId?.get(
                                            selectedId
                                                ?: playback.stationId
                                                ?: preferences.lastStation
                                        )
                                    if (station == null)
                                        Text(stringResource(R.string.nothing_selected))
                                    else
                                        Row(
                                            Modifier.fillMaxSize(),
                                            horizontalArrangement = Arrangement.spacedBy(28.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            StationArtwork(
                                                c!!.artwork(station),
                                                Modifier.size(210.dp),
                                            )
                                            Column(
                                                verticalArrangement = Arrangement.spacedBy(14.dp),
                                                modifier =
                                                    Modifier.weight(1f)
                                                        .verticalScroll(rememberScrollState()),
                                            ) {
                                                Text(
                                                    c.stationName(station, preferences.locale),
                                                    fontSize = 32.sp,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                                Text(
                                                    listOf(
                                                            station.languages.joinToString(" · "),
                                                            c.networks[station.networkId]?.name,
                                                            station.country,
                                                        )
                                                        .filterNotNull()
                                                        .filter(String::isNotBlank)
                                                        .joinToString(" · "),
                                                    fontSize = 18.sp,
                                                )
                                                val eligible =
                                                    graph.policy.eligible(station).isNotEmpty()
                                                val status =
                                                    if (!eligible) "unavailable"
                                                    else if (playback.stationId == station.id)
                                                        playback.status
                                                    else "idle"
                                                Text(
                                                    stringResource(statusResource(status)),
                                                    color = Accent,
                                                    modifier =
                                                        Modifier.semantics {
                                                            liveRegion = LiveRegionMode.Polite
                                                        },
                                                )
                                                Row(
                                                    horizontalArrangement =
                                                        Arrangement.spacedBy(12.dp)
                                                ) {
                                                    val active =
                                                        playback.stationId == station.id &&
                                                            status in
                                                                listOf(
                                                                    "playing",
                                                                    "buffering",
                                                                    "reconnecting",
                                                                )
                                                    Button(
                                                        onClick = {
                                                            if (active) controller?.pause()
                                                            else tune(station.id)
                                                        },
                                                        enabled = eligible && controller != null,
                                                        modifier =
                                                            Modifier.focusRequester(playFocus),
                                                    ) {
                                                        Icon(
                                                            if (active) Icons.Default.Pause
                                                            else Icons.Default.PlayArrow,
                                                            null,
                                                        )
                                                        Text(
                                                            stringResource(
                                                                if (active) R.string.pause
                                                                else if (status == "failed")
                                                                    R.string.retry
                                                                else R.string.play
                                                            )
                                                        )
                                                    }
                                                    Button(onClick = { controller?.stop() }) {
                                                        Icon(Icons.Default.Stop, null)
                                                        Text(stringResource(R.string.stop_radio))
                                                    }
                                                }
                                                Button(
                                                    onClick = {
                                                        scope.launch {
                                                            graph.preferences.toggleFavorite(
                                                                station.id
                                                            )
                                                        }
                                                    }
                                                ) {
                                                    Icon(
                                                        if (station.id in preferences.favorites)
                                                            Icons.Default.Favorite
                                                        else Icons.Default.FavoriteBorder,
                                                        null,
                                                    )
                                                    Text(
                                                        stringResource(
                                                            if (station.id in preferences.favorites)
                                                                R.string.remove_favorite
                                                            else R.string.add_favorite
                                                        )
                                                    )
                                                }
                                                SleepTimerControls(
                                                    remaining,
                                                    hasSession,
                                                    ::chooseSleep,
                                                )
                                                station.about?.let {
                                                    Text(
                                                        it,
                                                        fontSize = 16.sp,
                                                        maxLines = 5,
                                                        overflow = TextOverflow.Ellipsis,
                                                    )
                                                }
                                            }
                                        }
                                }
                                "settings" ->
                                    LazyColumn(
                                        verticalArrangement = Arrangement.spacedBy(14.dp),
                                        modifier = Modifier.fillMaxSize().focusRestorer(),
                                    ) {
                                        item {
                                            Text(
                                                stringResource(R.string.settings),
                                                fontSize = 28.sp,
                                            )
                                        }
                                        item {
                                            val label = stringResource(R.string.language)
                                            Button(
                                                onClick = {
                                                    choice =
                                                        Choice(
                                                            label,
                                                            listOf(
                                                                Named("en", "English"),
                                                                Named("ta", "தமிழ்"),
                                                                Named("sa", "संस्कृतम्"),
                                                            ),
                                                            preferences.locale,
                                                        ) {
                                                            scope.launch {
                                                                graph.preferences.setLocale(it)
                                                            }
                                                        }
                                                }
                                            ) {
                                                Text(label + ": " + preferences.locale)
                                            }
                                        }
                                        item {
                                            Button(
                                                onClick = {
                                                    scope.launch {
                                                        graph.preferences.setBackground(
                                                            !preferences.background
                                                        )
                                                    }
                                                }
                                            ) {
                                                Text(
                                                    stringResource(R.string.background) +
                                                        ": " +
                                                        stringResource(
                                                            if (preferences.background)
                                                                R.string.enabled
                                                            else R.string.disabled
                                                        )
                                                )
                                            }
                                        }
                                        item {
                                            Text(
                                                stringResource(R.string.background_note),
                                                fontSize = 16.sp,
                                            )
                                        }
                                        item {
                                            SleepTimerControls(remaining, hasSession, ::chooseSleep)
                                            Button(
                                                onClick = { controller?.stop() },
                                                enabled = hasSession,
                                            ) {
                                                Text(stringResource(R.string.stop_radio))
                                            }
                                        }
                                        item {
                                            Button(
                                                onClick = {
                                                    scope.launch { graph.catalog.refresh() }
                                                },
                                                enabled = !state.loading,
                                            ) {
                                                Text(
                                                    stringResource(
                                                        if (state.loading) R.string.refreshing
                                                        else R.string.refresh
                                                    )
                                                )
                                            }
                                        }
                                        item {
                                            val title = stringResource(R.string.clear_cache)
                                            val cancel = stringResource(R.string.back)
                                            Button(
                                                onClick = {
                                                    choice =
                                                        Choice(
                                                            title,
                                                            listOf(
                                                                Named("cancel", cancel),
                                                                Named("clear", title),
                                                            ),
                                                            "cancel",
                                                        ) {
                                                            if (it == "clear")
                                                                scope.launch {
                                                                    graph.catalog.clearCache()
                                                                    cacheCleared = true
                                                                }
                                                        }
                                                }
                                            ) {
                                                Text(title)
                                            }
                                        }
                                        item {
                                            if (cacheCleared)
                                                Text(
                                                    stringResource(R.string.cache_cleared),
                                                    modifier =
                                                        Modifier.semantics {
                                                            liveRegion = LiveRegionMode.Polite
                                                        },
                                                )
                                        }
                                        item {
                                            Button(onClick = { legal = true }) {
                                                Text(stringResource(R.string.about))
                                            }
                                        }
                                        item {
                                            Text(
                                                stringResource(
                                                    R.string.app_version,
                                                    stringResource(R.string.app_name),
                                                    BuildConfig.VERSION_NAME,
                                                    BuildConfig.VERSION_CODE,
                                                )
                                            )
                                        }
                                        item {
                                            Text("com.actionanand.radiobee.app", fontSize = 14.sp)
                                        }
                                        item {
                                            c?.let {
                                                Text(
                                                    "V2 · ${it.version} · ${it.publishedOn}",
                                                    fontSize = 14.sp,
                                                )
                                            }
                                        }
                                    }
                            }
                        }
                    }
                if (page != "player" && playback.stationId != null) {
                    val active = c?.byId?.get(playback.stationId)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Button(
                            onClick = {
                                selectedId = playback.stationId
                                returnPage = page
                                page = "player"
                            }
                        ) {
                            Icon(Icons.Default.Radio, null)
                            Text(
                                active?.let { c.stationName(it, preferences.locale) }
                                    ?: stringResource(R.string.now_playing),
                                maxLines = 1,
                            )
                        }
                        Text(stringResource(statusResource(playback.status)), color = Accent)
                        if (remaining > 0) Text(sleepStatus(remaining), fontSize = 14.sp)
                    }
                }
            }
            choice?.let { value -> ChoiceDialog(value) { choice = null } }
            if (firstStation != null)
                BackgroundPlaybackDialog(
                    savingChoice,
                    choiceError,
                    graph.firstPlayback::choose,
                    graph.firstPlayback::cancel,
                )
            if (legal)
                Dialog(onDismissRequest = { legal = false }) {
                    Column(
                        Modifier.background(Panel, RoundedCornerShape(18.dp))
                            .padding(24.dp)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Text(stringResource(R.string.about), fontSize = 26.sp)
                        Text(stringResource(R.string.legal_notice, stringResource(R.string.app_name)), fontSize = 18.sp)
                        Text(
                            "https://actionanand.github.io/radio-bee/privacy\nhttps://actionanand.github.io/radio-bee/terms\nhttps://actionanand.github.io/radio-bee/copyright-policy",
                            fontSize = 14.sp,
                        )
                        Button(onClick = { legal = false }) { Text(stringResource(R.string.close)) }
                    }
                }
        }
    }
}

private fun statusResource(status: String) =
    when (status) {
        "playing" -> R.string.playing
        "paused" -> R.string.paused
        "buffering" -> R.string.buffering
        "reconnecting" -> R.string.reconnecting
        "failed" -> R.string.failed
        "unavailable" -> R.string.unavailable
        else -> R.string.idle
    }

@Composable
private fun ChoiceDialog(choice: Choice, dismiss: () -> Unit) {
    val selected = choice.values.indexOfFirst { it.id == choice.current }.coerceAtLeast(0)
    val requester = remember { FocusRequester() }
    Dialog(onDismissRequest = dismiss) {
        Column(
            Modifier.width(500.dp)
                .heightIn(max = 440.dp)
                .background(Panel, RoundedCornerShape(18.dp))
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(choice.title, fontSize = 24.sp)
            LazyColumn(
                state = rememberLazyListState(selected),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                itemsIndexed(choice.values, key = { _, value -> value.id }) { index, value ->
                    Button(
                        onClick = {
                            choice.selected(value.id)
                            dismiss()
                        },
                        modifier =
                            Modifier.fillMaxWidth()
                                .heightIn(min = 48.dp)
                                .then(
                                    if (index == selected) Modifier.focusRequester(requester)
                                    else Modifier
                                ),
                    ) {
                        Text(value.name)
                    }
                }
            }
        }
        LaunchedEffect(Unit) {
            withFrameNanos {}
            runCatching { requester.requestFocus() }
        }
    }
}

@Composable
fun StationRow(
    stations: List<Station>,
    catalog: Catalog,
    locale: String,
    favorites: Set<String>,
    select: (Station) -> Unit,
    restoreKey: String? = null,
    keyPrefix: String = "",
) {
    val requester = remember { FocusRequester() }
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(12.dp),
        modifier = Modifier.focusRestorer().focusGroup(),
    ) {
        items(stations, key = { it.id }) { station ->
            StationCard(
                station,
                catalog,
                locale,
                station.id in favorites,
                if (restoreKey == "$keyPrefix/${station.id}") Modifier.focusRequester(requester)
                else Modifier,
            ) {
                select(station)
            }
        }
    }
    LaunchedEffect(restoreKey) {
        if (stations.any { restoreKey == "$keyPrefix/${it.id}" }) {
            withFrameNanos {}
            runCatching { requester.requestFocus() }
        }
    }
}

@Composable
fun StationCard(
    station: Station,
    catalog: Catalog,
    locale: String,
    favorite: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    Card(
        onClick = onClick,
        modifier =
            modifier
                .width(190.dp)
                .height(230.dp)
                .onFocusChanged { focused = it.hasFocus }
                .border(
                    if (focused) 3.dp else 1.dp,
                    if (focused) Accent else Panel,
                    RoundedCornerShape(12.dp),
                )
                .semantics { contentDescription = catalog.stationName(station, locale) },
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            StationArtwork(catalog.artwork(station), Modifier.fillMaxWidth().height(132.dp))
            Text(
                catalog.stationName(station, locale),
                fontSize = 18.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.heightIn(min = 48.dp),
            )
            Row {
                Text(station.country, fontSize = 14.sp)
                if (favorite) {
                    Spacer(Modifier.width(8.dp))
                    Icon(
                        Icons.Default.Favorite,
                        contentDescription = stringResource(R.string.favorites),
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}
