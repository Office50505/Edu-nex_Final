package com.skillomate.app

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class SkillomateBillingDiagnosticsPackage : BaseReactPackage() {
  override fun getModule(name: String, context: ReactApplicationContext): NativeModule? =
    if (name == SkillomateBillingDiagnosticsModule.NAME) SkillomateBillingDiagnosticsModule(context) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    val name = SkillomateBillingDiagnosticsModule.NAME
    mapOf(name to ReactModuleInfo(name, name, false, false, false, false))
  }
}
