package io.github.dailosman.c1bomberos;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Test C1 Bomberos.
 *
 * La aplicacion es la misma que la version web, servida desde dentro del APK.
 * No usa file:// sino WebViewAssetLoader, que la publica en un origen https
 * interno: es lo que hace que el progreso se guarde de verdad y sobreviva a
 * cerrar la app, porque en file:// el navegador trata cada carga como un sitio
 * distinto y tira el almacenamiento.
 */
public class MainActivity extends AppCompatActivity {

    private static final String DOMINIO = "appassets.androidplatform.net";
    private static final String INICIO = "https://" + DOMINIO + "/assets/index.html";

    private WebView web;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);

        final WebViewAssetLoader cargador = new WebViewAssetLoader.Builder()
                .setDomain(DOMINIO)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Que el WebView siga el modo claro/oscuro del telefono: la app web ya
        // reacciona a prefers-color-scheme, solo hay que dejarla enterarse.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, true);
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest peticion) {
                return cargador.shouldInterceptRequest(peticion.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest peticion) {
                // La app es autonoma: no debe navegar fuera de sus propios ficheros.
                Uri u = peticion.getUrl();
                return !DOMINIO.equals(u.getHost());
            }
        });

        web.addJavascriptInterface(new Puente(), "AndroidApp");
        web.setBackgroundColor(0xFFF4F5F7);

        if (estado != null) {
            web.restoreState(estado);
        } else {
            web.loadUrl(INICIO);
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // Se lo pregunta a la app: cierra el dialogo abierto, sale del
                // test o vuelve al inicio. Si no tiene nada que hacer, cerramos.
                web.evaluateJavascript(
                        "(function(){try{return !!(window.__atras && window.__atras());}catch(e){return false;}})()",
                        valor -> {
                            if (!"true".equals(valor)) {
                                setEnabled(false);
                                getOnBackPressedDispatcher().onBackPressed();
                            }
                        });
            }
        });
    }

    @Override
    protected void onPause() {
        // Si el telefono mata la app en segundo plano, que no se pierda el test.
        if (web != null) {
            web.evaluateJavascript("window.__guardar && window.__guardar();", null);
        }
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle fuera) {
        super.onSaveInstanceState(fuera);
        if (web != null) web.saveState(fuera);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Lo que la app web puede pedirle a Android. Solo guardar ficheros. */
    private class Puente {

        /**
         * Escribe una copia de seguridad en la carpeta Descargas del telefono.
         * No hace falta ningun permiso: en Android 10 y posteriores se usa
         * MediaStore, y en versiones anteriores la carpeta propia de la app.
         *
         * @return la ruta visible para el usuario, o cadena vacia si ha fallado.
         */
        @JavascriptInterface
        public String guardarFichero(String nombre, String contenido) {
            if (nombre == null || nombre.trim().isEmpty()) nombre = "copia.json";
            nombre = nombre.replaceAll("[\\\\/:*?\"<>|]", "_");
            byte[] datos = contenido == null
                    ? new byte[0]
                    : contenido.getBytes(StandardCharsets.UTF_8);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, nombre);
                    v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri destino = getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (destino == null) return "";
                    try (OutputStream salida = getContentResolver().openOutputStream(destino)) {
                        if (salida == null) return "";
                        salida.write(datos);
                    }
                    avisar(nombre);
                    return "Descargas/" + nombre;
                }
                File carpeta = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (carpeta == null) return "";
                if (!carpeta.exists() && !carpeta.mkdirs()) return "";
                File destino = new File(carpeta, nombre);
                try (FileOutputStream salida = new FileOutputStream(destino)) {
                    salida.write(datos);
                }
                avisar(nombre);
                return destino.getAbsolutePath();
            } catch (Exception e) {
                return "";
            }
        }

        private void avisar(final String nombre) {
            runOnUiThread(() ->
                    Toast.makeText(MainActivity.this, "Guardado: " + nombre, Toast.LENGTH_LONG).show());
        }
    }
}
