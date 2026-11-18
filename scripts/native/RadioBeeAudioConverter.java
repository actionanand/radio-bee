package com.getcapacitor.myapp;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaMetadataRetriever;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

/**
 * Offline WebM/Ogg/MP4 audio -> AAC inside MP4, using platform codecs only.
 * Work runs on the plugin background executor; the original SAF recording is
 * retained until this class and the final folder write have both succeeded.
 */
public final class RadioBeeAudioConverter {
    private RadioBeeAudioConverter() {}

    public static void convert(File input, File output, int bitrate, boolean cover, String station, Context context)
            throws Exception {
        if (bitrate != 64000 && bitrate != 96000 && bitrate != 128000)
            throw new IllegalArgumentException("Invalid AAC bitrate");
        MediaExtractor extractor = new MediaExtractor();
        MediaCodec decoder = null, encoder = null;
        MediaMuxer muxer = null;
        boolean muxerStarted = false;
        boolean succeeded = false;
        try {
            extractor.setDataSource(input.getAbsolutePath());
            int selected = -1;
            MediaFormat source = null;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    selected = i;
                    source = format;
                    break;
                }
            }
            if (selected < 0 || source == null) throw new IOException("Recording has no audio track");
            extractor.selectTrack(selected);
            String sourceMime = source.getString(MediaFormat.KEY_MIME);
            if (sourceMime == null) throw new IOException("Unknown recording codec");
            int rate = source.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            int channels = source.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
            if (channels < 1 || channels > 2 || rate < 8000 || rate > 96000)
                throw new IOException("Unsupported recording channel count or sample rate");

            decoder = MediaCodec.createDecoderByType(sourceMime);
            decoder.configure(source, null, null, 0);
            decoder.start();
            MediaFormat aacFormat = MediaFormat.createAudioFormat("audio/mp4a-latm", rate, channels);
            aacFormat.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
            aacFormat.setInteger(MediaFormat.KEY_BIT_RATE, bitrate);
            aacFormat.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 32768);
            encoder = MediaCodec.createEncoderByType("audio/mp4a-latm");
            encoder.configure(aacFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            encoder.start();
            muxer = new MediaMuxer(output.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);

            boolean sourceEos = false, decoderEos = false, encoderEosQueued = false, encoderEos = false;
            byte[] pending = null;
            int pendingOffset = 0;
            long pendingPts = 0;
            int audioTrack = -1;
            long lastEncoderPts = 0;
            MediaCodec.BufferInfo decodedInfo = new MediaCodec.BufferInfo();
            MediaCodec.BufferInfo encodedInfo = new MediaCodec.BufferInfo();
            long deadline = System.currentTimeMillis() + 15 * 60_000L;
            while (!encoderEos) {
                if (System.currentTimeMillis() > deadline)
                    throw new IOException("Audio conversion exceeded time limit");

                // Feed the AAC encoder before accepting more decoded PCM, bounding memory use.
                if (pending != null || (decoderEos && !encoderEosQueued)) {
                    int index = encoder.dequeueInputBuffer(10_000);
                    if (index >= 0) {
                        ByteBuffer dst = encoder.getInputBuffer(index);
                        if (dst == null) throw new IOException("AAC input buffer unavailable");
                        dst.clear();
                        if (pending != null) {
                            int n = Math.min(dst.remaining(), pending.length - pendingOffset);
                            int sampleFrame = Math.max(2, channels * 2);
                            n -= n % sampleFrame;
                            if (n == 0) throw new IOException("AAC input buffer too small");
                            dst.put(pending, pendingOffset, n);
                            long pts = pendingPts + (long) pendingOffset / sampleFrame * 1_000_000L / rate;
                            lastEncoderPts = Math.max(lastEncoderPts, pts);
                            encoder.queueInputBuffer(index, 0, n, lastEncoderPts, 0);
                            pendingOffset += n;
                            if (pendingOffset == pending.length) {
                                pending = null;
                                pendingOffset = 0;
                            }
                        } else {
                            encoder.queueInputBuffer(index, 0, 0, lastEncoderPts, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            encoderEosQueued = true;
                        }
                    }
                }
                if (!sourceEos) {
                    int index = decoder.dequeueInputBuffer(0);
                    if (index >= 0) {
                        ByteBuffer dst = decoder.getInputBuffer(index);
                        if (dst == null) throw new IOException("Decoder input unavailable");
                        dst.clear();
                        int n = extractor.readSampleData(dst, 0);
                        if (n < 0) {
                            decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            sourceEos = true;
                        } else {
                            decoder.queueInputBuffer(index, 0, n, Math.max(0, extractor.getSampleTime()), 0);
                            extractor.advance();
                        }
                    }
                }
                if (pending == null && !decoderEos) {
                    int index = decoder.dequeueOutputBuffer(decodedInfo, 10_000);
                    if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        MediaFormat actual = decoder.getOutputFormat();
                        if (actual.getInteger(MediaFormat.KEY_SAMPLE_RATE) != rate ||
                            actual.getInteger(MediaFormat.KEY_CHANNEL_COUNT) != channels)
                            throw new IOException("Decoder changed the PCM format");
                        if (actual.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                            actual.getInteger(MediaFormat.KEY_PCM_ENCODING) != 2)
                            throw new IOException("Decoder output is not PCM16");
                    } else if (index >= 0) {
                        ByteBuffer pcm = decoder.getOutputBuffer(index);
                        if (pcm != null && decodedInfo.size > 0) {
                            pcm.position(decodedInfo.offset);
                            pcm.limit(decodedInfo.offset + decodedInfo.size);
                            pending = new byte[decodedInfo.size];
                            pcm.get(pending);
                            pendingPts = Math.max(0, decodedInfo.presentationTimeUs);
                        }
                        if ((decodedInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0)
                            decoderEos = true;
                        decoder.releaseOutputBuffer(index, false);
                    }
                }
                int index = encoder.dequeueOutputBuffer(encodedInfo, 10_000);
                if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    if (muxerStarted) throw new IOException("AAC output format changed twice");
                    audioTrack = muxer.addTrack(encoder.getOutputFormat());
                    muxer.start();
                    muxerStarted = true;
                } else if (index >= 0) {
                    ByteBuffer packet = encoder.getOutputBuffer(index);
                    if (muxerStarted && audioTrack >= 0 && packet != null && encodedInfo.size > 0 &&
                        (encodedInfo.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                        packet.position(encodedInfo.offset);
                        packet.limit(encodedInfo.offset + encodedInfo.size);
                        muxer.writeSampleData(audioTrack, packet, encodedInfo);
                    }
                    if ((encodedInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) encoderEos = true;
                    encoder.releaseOutputBuffer(index, false);
                }
            }
            if (!muxerStarted) throw new IOException("No AAC output was produced");
            muxer.stop();
            muxerStarted = false;
            muxer.release();
            muxer = null;
            if (cover) {
                // A direct R reference survives resource shrinking; a dynamic
                // getIdentifier lookup may be stripped from release APKs.
                Bitmap bitmap = BitmapFactory.decodeResource(
                    context.getResources(), R.drawable.radiobee_recording_cover);
                if (bitmap == null) throw new IOException("RadioBee cover cannot be decoded");
                ByteArrayOutputStream jpg = new ByteArrayOutputStream();
                try {
                    if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 86, jpg))
                        throw new IOException("RadioBee artwork encoding failed");
                } finally { bitmap.recycle(); }
                embedMetadata(output, station, jpg.toByteArray());
                verifyArtwork(output);
            }
            succeeded = output.length() > 128;
        } finally {
            try { extractor.release(); } catch (Exception ignored) { }
            if (decoder != null) { try { decoder.stop(); } catch (Exception ignored) { } decoder.release(); }
            if (encoder != null) { try { encoder.stop(); } catch (Exception ignored) { } encoder.release(); }
            if (muxer != null) {
                if (muxerStarted) { try { muxer.stop(); } catch (Exception ignored) { } }
                muxer.release();
            }
            if (!succeeded) output.delete();
        }
        if (!succeeded) throw new IOException("Empty converted recording");
    }

    /** Catch malformed metadata before the Android plugin replaces the raw export. */
    private static void verifyArtwork(File output) throws IOException {
        MediaMetadataRetriever reader = new MediaMetadataRetriever();
        try {
            reader.setDataSource(output.getAbsolutePath());
            byte[] cover = reader.getEmbeddedPicture();
            if (cover == null || cover.length < 1024)
                throw new IOException("M4A cover artwork could not be read back");
        } catch (RuntimeException error) {
            throw new IOException("M4A artwork metadata validation failed", error);
        } finally {
            reader.release();
        }
    }

    private static byte[] atom(String name, byte[] payload) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(bytes);
        out.writeInt(payload.length + 8);
        out.write(name.getBytes(StandardCharsets.ISO_8859_1));
        out.write(payload);
        return bytes.toByteArray();
    }
    private static byte[] concat(byte[]... chunks) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] chunk : chunks) out.write(chunk);
        return out.toByteArray();
    }
    private static byte[] data(int kind, byte[] value) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(bytes);
        out.writeInt(kind);
        out.writeInt(0);
        out.write(value);
        return atom("data", bytes.toByteArray());
    }
    private static byte[] textTag(String key, String value) throws IOException {
        return atom(key, data(1, value.getBytes(StandardCharsets.UTF_8)));
    }
    private static byte[] metadata(String station, byte[] jpeg) throws IOException {
        String title = (station == null || station.isBlank() ? "RadioBee" : station);
        if (title.length() > 120) title = title.substring(0, 120);
        byte[] ilst = atom("ilst", concat(
            textTag("\u00a9nam", title + " — Live Recording"),
            textTag("\u00a9ART", title),
            textTag("\u00a9alb", "RadioBee Recordings"),
            atom("covr", data(13, jpeg))));
        ByteArrayOutputStream handler = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(handler);
        out.writeInt(0);
        out.writeInt(0);
        out.writeBytes("mdir");
        out.write(new byte[12]);
        out.writeByte(0);
        byte[] meta = atom("meta", concat(new byte[4], atom("hdlr", handler.toByteArray()), ilst));
        return atom("udta", meta);
    }
    /** MediaMuxer puts moov at EOF. Extend it there without shifting mdat offsets. */
    private static void embedMetadata(File output, String station, byte[] jpeg) throws IOException {
        byte[] udta = metadata(station, jpeg);
        try (RandomAccessFile raf = new RandomAccessFile(output, "rw")) {
            long pos = 0, moovAt = -1, moovSize = -1;
            while (pos + 8 <= raf.length()) {
                raf.seek(pos);
                long size = raf.readInt() & 0xffffffffL;
                byte[] type = new byte[4];
                raf.readFully(type);
                String name = new String(type, StandardCharsets.ISO_8859_1);
                if (size == 1 || size < 8 || pos + size > raf.length())
                    throw new IOException("Unsupported MP4 atom layout");
                if ("moov".equals(name)) { moovAt = pos; moovSize = size; }
                pos += size;
            }
            if (moovAt < 0 || moovAt + moovSize != raf.length() ||
                moovSize + udta.length >= 0xffffffffL)
                throw new IOException("Unsupported MP4 metadata layout");
            raf.seek(raf.length());
            raf.write(udta);
            raf.seek(moovAt);
            raf.writeInt((int) (moovSize + udta.length));
        }
    }
}
