package com.dairyone.agent;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * A handful of WebView settings that Capacitor doesn't set for you and that
 * are the difference between "an app that happens to use a WebView" and
 * "a website in a frame": no pinch-zoom, no edge-of-scroll glow effect, and
 * no long-press text-selection callout on non-input content. All three are
 * on by default in a stock Android WebView.
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = this.bridge.getWebView();
    WebSettings settings = webView.getSettings();

    // The app's own CSS viewport meta (user-scalable=no) handles most of
    // this, but Chrome's double-tap-to-zoom gesture and the on-screen zoom
    // buttons are a WebView-level feature that meta tags alone don't fully
    // suppress on every OEM WebView build.
    settings.setSupportZoom(false);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);

    // The blue/grey "glow" when you scroll past the top/bottom of a page is
    // a stock Android WebView (and browser) affordance — jarring in an app
    // that's meant to feel native, where lists just stop.
    webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
  }
}
