package com.actionanand.radiobee.tv.ui

import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.tv.material3.MaterialTheme
import com.actionanand.radiobee.tv.data.*
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

@OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)
class RemoteFocusTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun dpadMovesBetweenRealStationCardsAndEnterSelects() {
        fun station(id: String, name: String) =
            Station(
                id,
                name,
                "network",
                "IN",
                null,
                null,
                null,
                setOf("ta"),
                setOf("general"),
                emptySet(),
                emptyList(),
                emptyList(),
                null,
                null,
                null,
                null,
                true,
            )
        val first = station("first", "தமிழ் வானொலி")
        val second = station("second", "संस्कृतवाणी")
        val c =
            Catalog(
                "2.0.0",
                "2026-01-01",
                listOf(first, second),
                emptyMap(),
                emptyMap(),
                emptyList(),
                emptyList(),
                emptyList(),
                emptyList(),
                emptyList(),
                emptyMap(),
            )
        var selected = ""
        compose.setContent {
            MaterialTheme {
                StationRow(c.stations, c, "en", emptySet(), select = { selected = it.id })
            }
        }
        compose
            .onNodeWithContentDescription(first.name)
            .performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription(first.name).performKeyInput {
            keyDown(Key.DirectionRight)
            keyUp(Key.DirectionRight)
        }
        compose.onNodeWithContentDescription(second.name).assertIsFocused().performKeyInput {
            keyDown(Key.Enter)
            keyUp(Key.Enter)
        }
        compose.runOnIdle { assertEquals(second.id, selected) }
    }
}
