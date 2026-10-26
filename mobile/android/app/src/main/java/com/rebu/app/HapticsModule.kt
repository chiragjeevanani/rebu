package com.rebu.app

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * Short, crisp haptic ticks (long-press menus, selections). Uses the device's
 * predefined click effects where available so it feels like the system's own.
 */
class HapticsModule(context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName() = "Haptics"

  private val vibrator: Vibrator? by lazy {
    val ctx = reactApplicationContext
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)
        ?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
  }

  /** kind: "heavy" (long press), "light" (selection). */
  @ReactMethod
  fun impact(kind: String) {
    val v = vibrator ?: return
    if (!v.hasVibrator()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val effect =
        if (kind == "light") VibrationEffect.EFFECT_TICK else VibrationEffect.EFFECT_HEAVY_CLICK
      v.vibrate(VibrationEffect.createPredefined(effect))
    } else {
      val ms = if (kind == "light") 10L else 25L
      v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
    }
  }
}

class HapticsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(HapticsModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
