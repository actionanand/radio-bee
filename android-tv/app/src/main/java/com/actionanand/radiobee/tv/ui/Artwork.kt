package com.actionanand.radiobee.tv.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.actionanand.radiobee.tv.R
import com.actionanand.radiobee.tv.data.validUrl
import com.caverock.androidsvg.SVG
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private object ArtCache {
    val images =
        object : LruCache<String, ImageBitmap>(8 * 1024 * 1024) {
            override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
        }
}

@Composable
fun StationArtwork(urls: List<String>, modifier: Modifier = Modifier) {
    val bitmap by
        produceState<ImageBitmap?>(null, urls) {
            value = null
            for (url in urls) {
                val image =
                    ArtCache.images.get(url)
                        ?: withContext(Dispatchers.IO) {
                            if (!validUrl(url)) return@withContext null
                            runCatching {
                                val connection = URL(url).openConnection() as HttpURLConnection
                                connection.connectTimeout = 5000
                                connection.readTimeout = 5000
                                connection.instanceFollowRedirects = false
                                try {
                                    if (connection.responseCode != 200) return@runCatching null
                                    val data =
                                        connection.inputStream.use { input ->
                                            val output = java.io.ByteArrayOutputStream()
                                            val buffer = ByteArray(8192)
                                            while (true) {
                                                val n = input.read(buffer)
                                                if (n < 0) break
                                                require(output.size() + n <= 2 * 1024 * 1024)
                                                output.write(buffer, 0, n)
                                            }
                                            output.toByteArray()
                                        }
                                    ArtworkDecoder.decode(data)?.asImageBitmap()
                                } finally {
                                    connection.disconnect()
                                }
                            }
                                .getOrNull()
                        }
                if (image != null) {
                    ArtCache.images.put(url, image)
                    value = image
                    break
                }
            }
        }
    if (bitmap != null)
        Image(
            bitmap!!,
            contentDescription = null,
            modifier = modifier,
            contentScale = ContentScale.Fit,
        )
    else
        Image(
            painterResource(R.drawable.radiobee_logo),
            contentDescription = null,
            modifier = modifier,
            contentScale = ContentScale.Fit,
        )
}

/** Pure preflight: no DTD/entities, external resolver or WebView is needed for catalogue logos. */
internal fun svgMarkup(data: ByteArray): String? {
    require(data.size <= 2 * 1024 * 1024)
    if (!data.take(4096).toByteArray().toString(Charsets.UTF_8).contains("<svg", ignoreCase = true))
        return null
    val text = data.toString(Charsets.UTF_8)
    require(
        !text.contains("<!DOCTYPE", ignoreCase = true) &&
            !text.contains("<!ENTITY", ignoreCase = true)
    )
    return text
}

internal object ArtworkDecoder {
    init {
        SVG.setInternalEntitiesEnabled(false)
        SVG.deregisterExternalFileResolver()
    }

    fun decode(data: ByteArray): Bitmap? {
        val markup = svgMarkup(data)
        if (markup != null) {
            val svg = SVG.getFromString(markup)
            if (svg.documentViewBox == null) {
                val width = svg.documentWidth.takeIf { it.isFinite() && it > 0 } ?: 512f
                val height = svg.documentHeight.takeIf { it.isFinite() && it > 0 } ?: 512f
                svg.setDocumentViewBox(0f, 0f, width, height)
            }
            svg.setDocumentWidth(512f)
            svg.setDocumentHeight(512f)
            return Bitmap.createBitmap(512, 512, Bitmap.Config.ARGB_8888).also {
                svg.renderToCanvas(Canvas(it))
            }
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
        require(bounds.outWidth in 1..8000 && bounds.outHeight in 1..8000)
        val options = BitmapFactory.Options().apply { inSampleSize = 1 }
        while (
            bounds.outWidth / options.inSampleSize > 512 ||
                bounds.outHeight / options.inSampleSize > 512
        ) options.inSampleSize *= 2
        return BitmapFactory.decodeByteArray(data, 0, data.size, options)
    }
}
