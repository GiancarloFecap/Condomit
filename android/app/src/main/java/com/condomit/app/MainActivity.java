package com.condomit.app;

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
