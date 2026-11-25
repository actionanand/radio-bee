package com.actionanand.radiobee.tv.playback

import android.app.ActivityManager
import android.content.Context
import android.view.WindowManager
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import com.actionanand.radiobee.tv.MainActivity
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class ServiceVisibilityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun idleServiceStaysBoundWhileVisibleStopsWhenHiddenAndReconnectsOnReturn() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        fun running() =
            manager.getRunningServices(Int.MAX_VALUE).find {
                it.service.className == RadioPlaybackService::class.java.name
            }
        compose.waitUntil(5000) { running() != null }
        compose.runOnIdle {
            assertFalse(checkNotNull(running()).foreground)
            assertEquals(
                0,
                compose.activity.window.attributes.flags and
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            )
        }
        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        compose.waitUntil(5000) { running() == null }
        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        compose.waitUntil(5000) { running() != null }
        compose.runOnIdle { assertFalse(checkNotNull(running()).foreground) }
    }
}
