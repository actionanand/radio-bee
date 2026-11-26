package com.actionanand.radiobee.tv.ui

import org.junit.Assert.*
import org.junit.Test

class ArtworkTest {
    @Test
    fun svgCatalogueArtworkRetainsUnicode() {
        val svg =
            "<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"><text>தமிழ் संस्कृतम्</text></svg>"
        assertEquals(svg, svgMarkup(svg.toByteArray()))
    }

    @Test
    fun bitmapDataDoesNotEnterSvgDecoder() {
        assertNull(svgMarkup(byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47)))
    }

    @Test
    fun xmlEntitiesCannotResolveExternalOrInternalResources() {
        for (declaration in listOf("<!DOCTYPE svg>", "<!ENTITY secret SYSTEM 'file:///test'>")) {
            assertThrows(IllegalArgumentException::class.java) {
                svgMarkup((declaration + "<svg/>").toByteArray())
            }
        }
    }

    @Test
    fun oversizedArtworkIsRejectedBeforeDecoding() {
        assertThrows(IllegalArgumentException::class.java) {
            svgMarkup(ByteArray(2 * 1024 * 1024 + 1))
        }
    }
}
