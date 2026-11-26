package com.actionanand.radiobee.tv.ui

import android.content.res.Configuration
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.actionanand.radiobee.tv.R
import java.util.Locale
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalTestApi::class)
class BackgroundChoiceTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun dpadSelectsBothActionsAndReturnsFocusToPlay() {
        var selected: Boolean? = null
        compose.setContent {
            MaterialTheme {
                var open by remember { mutableStateOf(false) }
                val focus = remember { FocusRequester() }
                var restore by remember { mutableStateOf(false) }
                Column {
                    Button(onClick = { open = true }, modifier = Modifier.focusRequester(focus)) {
                        Text("Play test station")
                    }
                    if (open)
                        BackgroundPlaybackDialog(
                            false,
                            false,
                            choose = {
                                selected = it
                                open = false
                                restore = true
                            },
                            dismiss = {
                                open = false
                                restore = true
                            },
                        )
                }
                LaunchedEffect(restore) {
                    if (restore) {
                        focus.requestFocus()
                        restore = false
                    }
                }
            }
        }
        compose.onNodeWithText("Play test station").performClick()
        compose.onNodeWithText("Keep playing").assertIsFocused().performKeyInput {
            keyDown(Key.DirectionDown)
            keyUp(Key.DirectionDown)
        }
        compose.onNodeWithText("Pause when I leave").assertIsFocused().performKeyInput {
            keyDown(Key.DirectionCenter)
            keyUp(Key.DirectionCenter)
        }
        compose.runOnIdle { assertEquals(false, selected) }
        compose.onNodeWithText("Play test station").assertIsFocused().performClick()
        compose.onNodeWithText("Keep playing").assertIsFocused().performKeyInput {
            keyDown(Key.Enter)
            keyUp(Key.Enter)
        }
        compose.runOnIdle { assertEquals(true, selected) }
        compose.onNodeWithText("Play test station").assertIsFocused()
    }

    @Test
    fun backDismissalDoesNotChooseAndDialogCanBeOpenedAgain() {
        var choices = 0
        var dismissed = 0
        compose.setContent {
            MaterialTheme {
                var open by remember { mutableStateOf(true) }
                if (open)
                    BackgroundPlaybackDialog(
                        false,
                        false,
                        { choices++ },
                        {
                            dismissed++
                            open = false
                        },
                    )
                Button(onClick = { open = true }) { Text("Retry") }
            }
        }
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
            .sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
        compose.runOnIdle {
            assertEquals(0, choices)
            assertEquals(1, dismissed)
        }
        compose.onNodeWithText("Retry").performClick()
        compose.onNodeWithText("Keep playing").assertIsFocused()
    }

    @Test
    fun savingDisablesRepeatedSelectionAndStorageFailureIsVisible() {
        compose.setContent {
            MaterialTheme {
                BackgroundPlaybackDialog(true, true, { fail("must not choose while saving") }, {})
            }
        }
        compose.onNodeWithText("Keep playing").assertIsNotEnabled()
        compose.onNodeWithText("Pause when I leave").assertIsNotEnabled()
        compose.onNodeWithText("Saving preference…").assertIsDisplayed()
        compose
            .onNodeWithText("Preferences could not be saved. Check device storage.")
            .assertIsDisplayed()
    }

    @Test
    fun failedSaveReturnsFocusToAnEnabledChoiceForRemoteRetry() {
        val saving = mutableStateOf(false)
        val error = mutableStateOf(false)
        compose.setContent {
            MaterialTheme {
                BackgroundPlaybackDialog(saving.value, error.value, { saving.value = true }, {})
            }
        }
        compose.onNodeWithText("Keep playing").assertIsFocused().performClick()
        compose.onNodeWithText("Keep playing").assertIsNotEnabled()
        compose.runOnIdle {
            saving.value = false
            error.value = true
        }
        compose.onNodeWithText("Keep playing").assertIsEnabled().assertIsFocused()
    }

    @Test
    fun englishTamilAndSanskritUseLocalizedChoicesAndReadableTimer() {
        val locale = mutableStateOf("en")
        val context =
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().targetContext
        compose.setContent {
            val config =
                Configuration(context.resources.configuration).apply {
                    setLocale(Locale.forLanguageTag(locale.value))
                }
            val localized = context.createConfigurationContext(config)
            CompositionLocalProvider(
                LocalContext provides localized,
                LocalConfiguration provides config,
            ) {
                MaterialTheme {
                    Text(sleepStatus(90000))
                    BackgroundPlaybackDialog(false, false, {}, {})
                }
            }
        }
        for (language in listOf("en", "ta", "sa")) {
            compose.runOnIdle { locale.value = language }
            val config =
                Configuration(context.resources.configuration).apply {
                    setLocale(Locale.forLanguageTag(language))
                }
            val resources = context.createConfigurationContext(config).resources
            compose.onNodeWithText(resources.getString(R.string.keep_playing)).assertIsDisplayed()
            compose
                .onNodeWithText(resources.getString(R.string.pause_when_leave))
                .assertIsDisplayed()
            // The timer behind the modal is checked in the unmerged tree, without claiming focus.
            compose
                .onNodeWithText(
                    resources.getString(R.string.sleep_active, "1:30"),
                    useUnmergedTree = true,
                )
                .assertExists()
            if (language != "en")
                assertNotEquals("Keep playing", resources.getString(R.string.keep_playing))
        }
    }
}
