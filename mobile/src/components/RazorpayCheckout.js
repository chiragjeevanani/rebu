import React from 'react';
import { Linking, Modal, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { API_URL } from '../api/client';

const CALLBACK = `${API_URL}/api/webhooks/razorpay/callback`;
const DONE = `${API_URL}/api/webhooks/razorpay/done`;

/**
 * Razorpay Standard Checkout inside a WebView (cards, UPI, netbanking,
 * wallets) in redirect mode: bank and OTP pages load as normal pages (pop-ups
 * can't open in a WebView), Razorpay posts the result to our server, which
 * verifies and settles it, then lands on /done — caught here as onDone({ status, message }).
 */
export default function RazorpayCheckout({
  checkout,
  prefill,
  onDone,
  onDismiss,
}) {
  const insets = useSafeAreaInsets();
  if (!checkout) return null;

  const options = {
    key: checkout.keyId,
    order_id: checkout.orderId,
    amount: checkout.amount,
    currency: checkout.currency,
    name: checkout.name || 'REBU',
    description: 'Coins',
    prefill: prefill || {},
    theme: { color: colors.primary },
    redirect: true,
    callback_url: CALLBACK,
  };
  const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#fff}</style>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script></head><body><script>
const send = m => window.ReactNativeWebView.postMessage(JSON.stringify(m));
const o = ${JSON.stringify(options)};
o.handler = r => send({ type: 'success', data: r });
o.modal = { ondismiss: () => send({ type: 'dismiss' }), confirm_close: true };
const rzp = new Razorpay(o);
rzp.on('payment.failed', r => send({ type: 'failed', data: r.error }));
rzp.open();
</script></body></html>`;

  const onMessage = e => {
    let m;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.type === 'dismiss') onDismiss();
  };

  // UPI apps (GPay, PhonePe…) are opened via intent links, not loaded in the page.
  const onShouldStart = req => {
    const url = req.url || '';
    if (url.startsWith(DONE)) {
      const q = Object.fromEntries(
        url
          .slice(url.indexOf('?') + 1)
          .split('&')
          .map(kv =>
            kv.split('=').map(v => decodeURIComponent(v.split('+').join(' '))),
          ),
      );
      onDone({ status: q.status, message: q.message });
      return false;
    }
    if (/^(https?|about|data|blob):/.test(url)) return true;
    Linking.openURL(url).catch(() => {});
    return false;
  };

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View
        style={[
          styles.root,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <WebView
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://api.razorpay.com' }}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStart}
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
});
