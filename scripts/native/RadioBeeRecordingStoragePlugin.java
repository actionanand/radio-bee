package com.getcapacitor.myapp;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.UriPermission;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.io.InputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** Scoped Storage Access Framework destination; no legacy storage permissions. */
@CapacitorPlugin(name = "RadioBeeRecordingStorage")
public class RadioBeeRecordingStoragePlugin extends Plugin {
    private static final String PREFS = "radiobee_recordings";
    private static final String FOLDER = "folder_uri";
    private final Map<String, OutputStream> streams = new HashMap<>();
    private final Map<String, Uri> files = new HashMap<>();

    private Uri selectedFolder() {
        String saved = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(FOLDER, null);
        if (saved == null) return null;
        Uri uri = Uri.parse(saved);
        for (UriPermission permission : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (permission.getUri().equals(uri) && permission.isWritePermission()) {
                DocumentFile directory = DocumentFile.fromTreeUri(getContext(), uri);
                if (directory != null && directory.exists() && directory.canWrite()) return uri;
            }
        }
        return null;
    }

    private String folderName(Uri uri) {
        DocumentFile directory = DocumentFile.fromTreeUri(getContext(), uri);
        return directory == null || directory.getName() == null ? "Selected folder" : directory.getName();
    }

    @PluginMethod
    public void getFolder(PluginCall call) {
        Uri uri = selectedFolder();
        JSObject reply = new JSObject();
        reply.put("selected", uri != null);
        if (uri != null) reply.put("name", folderName(uri));
        call.resolve(reply);
    }

    @PluginMethod
    public void chooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "chosenFolder");
    }

    @ActivityCallback
    private void chosenFolder(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject reply = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null ||
            result.getData().getData() == null) {
            reply.put("selected", false);
            call.resolve(reply);
            return;
        }
        Uri uri = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            DocumentFile folder = DocumentFile.fromTreeUri(getContext(), uri);
            if (folder == null || !folder.exists() || !folder.canWrite()) throw new Exception("Folder not writable");
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(FOLDER, uri.toString()).apply();
            reply.put("selected", true);
            reply.put("name", folderName(uri));
            call.resolve(reply);
        } catch (Exception error) {
            call.reject("Selected folder cannot be used for recordings", error);
        }
    }

    @PluginMethod
    public void beginFile(PluginCall call) {
        Uri folderUri = selectedFolder();
        if (folderUri == null) { call.reject("Choose a recording folder in Settings"); return; }
        String name = call.getString("filename");
        String mime = call.getString("mimeType", "audio/webm");
        if (mime == null) mime = "audio/webm";
        mime = mime.split(";", 2)[0].trim();
        if (name == null || name.length() > 180 || name.contains("/") || name.contains("\\") ||
            name.contains("..") || !(name.endsWith(".webm") || name.endsWith(".ogg") || name.endsWith(".m4a"))) {
            call.reject("Invalid recording filename"); return;
        }
        if (!mime.startsWith("audio/")) { call.reject("Invalid recording MIME type"); return; }
        try {
            DocumentFile folder = DocumentFile.fromTreeUri(getContext(), folderUri);
            if (folder == null || !folder.canWrite()) throw new Exception("Folder access lost");
            String safeName = name;
            int n = 1;
            while (folder.findFile(safeName) != null) {
                int dot = name.lastIndexOf('.');
                safeName = name.substring(0, dot) + "-" + n++ + name.substring(dot);
            }
            DocumentFile file = folder.createFile(mime, safeName);
            if (file == null) throw new Exception("Could not create recording");
            OutputStream stream = getContext().getContentResolver().openOutputStream(file.getUri(), "w");
            if (stream == null) { file.delete(); throw new Exception("Could not open recording"); }
            String id = UUID.randomUUID().toString();
            synchronized (streams) { streams.put(id, stream); files.put(id, file.getUri()); }
            JSObject reply = new JSObject();
            reply.put("id", id);
            reply.put("name", safeName);
            call.resolve(reply);
        } catch (Exception error) { call.reject("Unable to create recording file", error); }
    }

    @PluginMethod
    public void appendData(PluginCall call) {
        String id = call.getString("id");
        String encoded = call.getString("base64");
        if (id == null || encoded == null || encoded.length() > 120000) {
            call.reject("Invalid recording chunk"); return;
        }
        synchronized (streams) {
            try {
                OutputStream out = streams.get(id);
                if (out == null) { call.reject("Recording file not open"); return; }
                out.write(Base64.decode(encoded, Base64.DEFAULT));
                call.resolve();
            } catch (Exception error) { call.reject("Unable to write recording", error); }
        }
    }

    @PluginMethod
    public void finishFile(PluginCall call) {
        String id = call.getString("id");
        synchronized (streams) {
            OutputStream out = streams.remove(id);
            files.remove(id);
            if (out == null) { call.reject("Recording file not open"); return; }
            try { out.close(); call.resolve(); }
            catch (Exception error) { call.reject("Unable to finish recording", error); }
        }
    }

    /**
     * Convert an already durable recording; on any error the original document
     * remains untouched and the JS caller reports that fallback to the user.
     * The platform codecs run off the WebView/UI thread.
     */
    @PluginMethod
    public void convertSaved(PluginCall call) {
        String filename = call.getString("filename");
        Integer bitrate = call.getInt("bitrate");
        boolean cover = Boolean.TRUE.equals(call.getBoolean("cover"));
        String station = call.getString("station", "RadioBee");
        if (filename == null || filename.length() > 180 || filename.contains("/") ||
            filename.contains("\\") || filename.contains("..") ||
            bitrate == null || !(bitrate == 64000 || bitrate == 96000 || bitrate == 128000)) {
            call.reject("Invalid recording conversion options");
            return;
        }
        Uri folderUri = selectedFolder();
        if (folderUri == null) { call.reject("Recording folder access unavailable"); return; }
        final String originalName = filename;
        final int outputRate = bitrate;
        final String stationName = station;
        new Thread(() -> {
            File raw = null, encoded = null;
            DocumentFile candidate = null;
            try {
                DocumentFile folder = DocumentFile.fromTreeUri(getContext(), folderUri);
                if (folder == null || !folder.canWrite())
                    throw new IOException("Recording folder is no longer writable");
                DocumentFile original = folder.findFile(originalName);
                if (original == null || !original.isFile())
                    throw new IOException("Original recording not found");
                raw = File.createTempFile("radiobee-original-", ".recording", getContext().getCacheDir());
                encoded = File.createTempFile("radiobee-aac-", ".m4a", getContext().getCacheDir());
                try (InputStream in = getContext().getContentResolver().openInputStream(original.getUri());
                     FileOutputStream out = new FileOutputStream(raw)) {
                    if (in == null) throw new IOException("Original recording cannot be read");
                    byte[] buffer = new byte[65536];
                    int n;
                    while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                }
                RadioBeeAudioConverter.convert(raw, encoded, outputRate, cover, stationName, getContext());
                String stem = originalName.replaceFirst("\\.[^.]+$", "");
                String resultName = stem + ".m4a";
                int suffix = 1;
                while (folder.findFile(resultName) != null)
                    resultName = stem + "-" + suffix++ + ".m4a";
                candidate = folder.createFile("audio/mp4", resultName);
                if (candidate == null) throw new IOException("Could not create converted recording");
                try (InputStream in = new FileInputStream(encoded);
                     OutputStream out = getContext().getContentResolver().openOutputStream(candidate.getUri(), "w")) {
                    if (out == null) throw new IOException("Could not write converted recording");
                    byte[] buffer = new byte[65536];
                    int n;
                    while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                }
                if (candidate.length() < 128)
                    throw new IOException("Converted recording is empty");
                // Only delete the original AFTER the converted file is durable.
                original.delete();
                JSObject result = new JSObject();
                result.put("name", resultName);
                result.put("converted", true);
                call.resolve(result);
            } catch (Exception failure) {
                if (candidate != null) candidate.delete();
                call.reject("M4A conversion failed; the original recording was preserved", failure);
            } finally {
                if (raw != null) raw.delete();
                if (encoded != null) encoded.delete();
            }
        }, "RadioBee-AAC-Conversion").start();
    }

    @PluginMethod
    public void cancelFile(PluginCall call) {
        String id = call.getString("id");
        synchronized (streams) {
            OutputStream out = streams.remove(id);
            Uri uri = files.remove(id);
            try {
                if (out != null) out.close();
                if (uri != null) DocumentsContract.deleteDocument(getContext().getContentResolver(), uri);
                call.resolve();
            } catch (Exception error) { call.reject("Unable to cancel recording", error); }
        }
    }
}
