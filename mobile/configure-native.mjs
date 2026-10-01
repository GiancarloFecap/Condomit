import { access, cp, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function patchAndroid() {
  const path = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!(await exists(path))) return false;
  let text = await readFile(path, 'utf8');
  const permissions = [
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />',
    '<uses-feature android:name="android.hardware.microphone" android:required="false" />'
  ];
  const missing = permissions.filter((line) => !text.includes(line));
  if (missing.length) {
    text = text.replace(/<application\b/, `${missing.join('\n    ')}\n\n    <application`);
    await writeFile(path, text, 'utf8');
  }
  if (!text.includes('android:windowSoftInputMode="adjustResize"')) {
    text = text.replace(
      'android:launchMode="singleTask"',
      'android:launchMode="singleTask"\n            android:windowSoftInputMode="adjustResize"'
    );
    await writeFile(path, text, 'utf8');
  }

  const iconSource = join(root, 'mobile', 'android-res');
  const iconTarget = join(root, 'android', 'app', 'src', 'main', 'res');
  if (await exists(iconSource)) {
    await cp(iconSource, iconTarget, { recursive: true, force: true });
    console.log('[Condomit] Ícones Android da Condomit restaurados.');
  }

  console.log('[Condomit] AndroidManifest configurado para câmera, microfone e teclado.');
  return true;
}

async function patchAndroidSafeInsets() {
  const activityPath = join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'condomit', 'app', 'MainActivity.java');
  if (!(await exists(activityPath))) return;
  const activity = `package com.condomit.app;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBarInsets();
    }

    private void applySystemBarInsets() {
        final View webView = getBridge().getWebView();
        if (webView == null) return;
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets safe = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            ViewGroup.LayoutParams rawParams = view.getLayoutParams();
            if (rawParams instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) rawParams;
                if (params.leftMargin != safe.left || params.topMargin != safe.top ||
                    params.rightMargin != safe.right || params.bottomMargin != safe.bottom) {
                    params.setMargins(safe.left, safe.top, safe.right, safe.bottom);
                    view.setLayoutParams(params);
                }
            } else {
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            }
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
`;
  await writeFile(activityPath, activity, 'utf8');

  const buildPath = join(root, 'android', 'app', 'build.gradle');
  if (await exists(buildPath)) {
    let build = await readFile(buildPath, 'utf8');
    if (!build.includes('androidx.core:core:$androidxCoreVersion')) {
      build = build.replace(
        '    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"',
        '    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"\n    implementation "androidx.core:core:$androidxCoreVersion"'
      );
      await writeFile(buildPath, build, 'utf8');
    }
  }
  console.log('[Condomit] Safe area nativa Android configurada.');
}

function plistPair(key, value) {
  return `\t<key>${key}</key>\n\t<string>${value}</string>`;
}

async function patchIos() {
  const path = join(root, 'ios', 'App', 'App', 'Info.plist');
  if (!(await exists(path))) return false;
  let text = await readFile(path, 'utf8');
  const entries = [
    ['NSCameraUsageDescription', 'O Condomit usa a câmera para reuniões de assembleia, perfil e recursos de acesso.'],
    ['NSMicrophoneUsageDescription', 'O Condomit usa o microfone para áudio nas reuniões de assembleia.']
  ];
  const missing = entries.filter(([key]) => !text.includes(`<key>${key}</key>`));
  if (missing.length) {
    const block = missing.map(([key, value]) => plistPair(key, value)).join('\n');
    text = text.replace(/\n<\/dict>/, `\n${block}\n</dict>`);
    await writeFile(path, text, 'utf8');
  }
  console.log('[Condomit] Info.plist configurado para câmera e microfone.');
  return true;
}

const android = await patchAndroid();
if (android) await patchAndroidSafeInsets();
const ios = await patchIos();
if (!android && !ios) {
  console.log('[Condomit] Nenhum projeto nativo encontrado ainda. Execute npx cap add android e/ou npx cap add ios.');
}
