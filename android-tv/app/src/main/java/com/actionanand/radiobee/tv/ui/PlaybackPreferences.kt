package com.actionanand.radiobee.tv.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.*
import com.actionanand.radiobee.tv.R
import java.util.Locale

@Composable
internal fun BackgroundPlaybackDialog(
    saving: Boolean,
    error: Boolean,
    choose: (Boolean) -> Unit,
    dismiss: () -> Unit,
) {
    val focus = remember { FocusRequester() }
    Dialog(onDismissRequest = dismiss) {
        Column(
            Modifier.widthIn(max = 640.dp)
                .background(Color(0xFF19392F), RoundedCornerShape(18.dp))
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                stringResource(R.string.background_question, stringResource(R.string.app_name)),
                fontSize = 26.sp,
                modifier = Modifier.semantics { heading() },
            )
            Text(stringResource(R.string.background_description, stringResource(R.string.app_name)), fontSize = 18.sp)
            if (error)
                Text(
                    stringResource(R.string.storage_error),
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            if (saving)
                Text(
                    stringResource(R.string.saving),
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            BackgroundChoice(R.string.keep_playing, !saving, Modifier.focusRequester(focus)) {
                choose(true)
            }
            BackgroundChoice(R.string.pause_when_leave, !saving) { choose(false) }
        }
        LaunchedEffect(saving) {
            if (!saving) {
                withFrameNanos {}
                focus.requestFocus()
            }
        }
    }
}

@Composable
private fun BackgroundChoice(
    label: Int,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier =
            modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .onFocusChanged { focused = it.hasFocus }
                .border(if (focused) 3.dp else 0.dp, Color(0xFFB9E79D), RoundedCornerShape(12.dp)),
    ) {
        Text(stringResource(label))
    }
}

@Composable
internal fun sleepStatus(remaining: Long): String {
    val seconds = (remaining + 999) / 1000
    val time = String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60)
    return stringResource(R.string.sleep_active, time)
}

@Composable
internal fun SleepTimerControls(remaining: Long, active: Boolean, choose: () -> Unit) {
    Button(onClick = choose, enabled = active || remaining > 0) {
        Text(stringResource(R.string.sleep))
    }
    Text(
        if (remaining > 0) sleepStatus(remaining)
        else stringResource(if (active) R.string.sleep_off else R.string.sleep_unavailable)
    )
}
