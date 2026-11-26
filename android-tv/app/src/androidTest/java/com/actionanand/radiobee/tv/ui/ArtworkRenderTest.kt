package com.actionanand.radiobee.tv.ui

import android.graphics.Color
import org.junit.Assert.*
import org.junit.Test

class ArtworkRenderTest {
    @Test
    fun nativeSvgDecoderRendersVisibleLogoPixels() {
        val bitmap =
            ArtworkDecoder.decode(
                "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" fill=\"#ff0000\"/></svg>"
                    .toByteArray()
            )!!
        assertEquals(512, bitmap.width)
        assertEquals(Color.RED, bitmap.getPixel(256, 256))
        bitmap.recycle()
    }
}
