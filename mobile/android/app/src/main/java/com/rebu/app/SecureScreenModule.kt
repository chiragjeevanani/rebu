package com.rebu.app

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * Blocks screenshots, screen recording and the recent-apps preview on private
 * screens (chats, calls, live rooms) via FLAG_SECURE.
 *
 * Reference-counted: every enable() must be paired with a disable(), so overlapping
 * screens during navigation transitions don't drop the protection early.
 *
 * Touching the window flags forces a window relayout, which stalls any running
 * screen transition. So the flag is only written when it actually changes, and
 * clearing it is delayed so moving between two private screens never flips it.
 */
class SecureScreenModule(context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  private val main = Handler(Looper.getMainLooper())
  private var count = 0
  private var secureActivity: Activity? = null
  private val clear = Runnable { if (count == 0) apply(false) }

  override fun getName() = "SecureScreen"

  @ReactMethod
  fun enable() {
    main.post {
      count += 1
      main.removeCallbacks(clear)
      apply(true)
    }
  }

  @ReactMethod
  fun disable() {
    main.post {
      count = maxOf(0, count - 1)
      if (count == 0) main.postDelayed(clear, CLEAR_DELAY_MS)
    }
  }

  private fun apply(secure: Boolean) {
    val activity = reactApplicationContext.currentActivity ?: return
    if (secure == (secureActivity === activity)) return
    if (secure) {
      activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
      secureActivity = activity
    } else {
      activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
      secureActivity = null
    }
  }

  private companion object {
    const val CLEAR_DELAY_MS = 600L
  }
}

class SecureScreenPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(SecureScreenModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
