package com.skillomate.app

import android.util.Log
import android.os.Handler
import android.os.Looper
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.QueryProductDetailsParams
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.module.annotations.ReactModule
import org.json.JSONObject

/** Local opt-in diagnostics only. This module never accepts raw product/config JSON. */
@ReactModule(name = SkillomateBillingDiagnosticsModule.NAME)
class SkillomateBillingDiagnosticsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val handler = Handler(Looper.getMainLooper())
  private var diagnosticClient: BillingClient? = null
  private var queryStarted = false
  override fun getName() = NAME
  override fun getConstants(): MutableMap<String, Any> = mutableMapOf(
    "enabled" to BuildConfig.SKILLOMATE_BILLING_DIAGNOSTICS,
  )

  @ReactMethod
  fun logEvent(event: String, details: ReadableMap) {
    if (!BuildConfig.SKILLOMATE_BILLING_DIAGNOSTICS) return
    val schema = schemas[event] ?: return
    val values = mutableMapOf<String, Any?>()
    for (key in schema) {
      if (!details.hasKey(key) || details.isNull(key)) continue
      values[key] = when (details.getType(key)) {
        ReadableType.String -> details.getString(key)
        ReadableType.Number -> details.getDouble(key)
        ReadableType.Boolean -> details.getBoolean(key)
        else -> null
      }
    }
    emit(event, values)
  }

  /** One read-only native query per local diagnostic run, independent of JS mapping. */
  @ReactMethod
  fun queryProduct(productId: String) {
    if (!BuildConfig.SKILLOMATE_BILLING_DIAGNOSTICS || !identifier.matches(productId)) return
    handler.post {
      if (queryStarted) return@post
      queryStarted = true
      var finished = false
      lateinit var timeout: Runnable
      fun finish(code: Int, count: Int, offerCount: Int = 0) {
        if (finished) return
        finished = true
        handler.removeCallbacks(timeout)
        emit("native_query", mapOf("productId" to productId, "responseCode" to code,
          "productCount" to count, "returnedSubscriptionOfferCount" to offerCount))
        runCatching { diagnosticClient?.endConnection() }
        diagnosticClient = null
      }
      timeout = Runnable { finish(BillingClient.BillingResponseCode.SERVICE_TIMEOUT, 0) }
      handler.postDelayed(timeout, 12_000L)
      try {
        // No purchase callback, purchase request, account data or acknowledgement
        // is consumed by this probe. It only reads ProductDetails then disconnects.
        val client = BillingClient.newBuilder(reactApplicationContext)
          .setListener { _, _ -> }
          .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
          .build()
        diagnosticClient = client
        client.startConnection(object : BillingClientStateListener {
          override fun onBillingServiceDisconnected() {
            handler.post { finish(BillingClient.BillingResponseCode.SERVICE_DISCONNECTED, 0) }
          }
          override fun onBillingSetupFinished(result: BillingResult) {
            handler.post setup@{
              if (finished) return@setup
              if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                finish(result.responseCode, 0)
                return@setup
              }
              try {
                val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(
                  QueryProductDetailsParams.Product.newBuilder().setProductId(productId)
                    .setProductType(BillingClient.ProductType.SUBS).build(),
                )).build()
                client.queryProductDetailsAsync(params) { response, products ->
                  handler.post parsed@{
                    if (finished) return@parsed
                    try {
                      val matching = products.productDetailsList.filter { it.productId == productId }
                      for (product in matching) {
                        product.subscriptionOfferDetails.orEmpty().forEachIndexed { offerIndex, offer ->
                          emit("native_offer", mapOf("productId" to productId, "shape" to "nativeProductDetails",
                            "offerIndex" to offerIndex, "basePlanId" to offer.basePlanId, "offerId" to offer.offerId,
                            "returnedOfferId" to offer.offerId, "offerTokenPresent" to offer.offerToken.isNotBlank(),
                            "phaseCount" to offer.pricingPhases.pricingPhaseList.size))
                          offer.pricingPhases.pricingPhaseList.forEachIndexed { phaseIndex, phase ->
                            emit("native_phase", mapOf("shape" to "nativeProductDetails", "offerIndex" to offerIndex,
                              "phaseIndex" to phaseIndex, "billingPeriod" to phase.billingPeriod,
                              "priceCurrencyCode" to phase.priceCurrencyCode, "formattedPrice" to phase.formattedPrice,
                              "recurrenceMode" to phase.recurrenceMode, "billingCycleCount" to phase.billingCycleCount))
                          }
                        }
                      }
                      finish(response.responseCode, matching.size, matching.sumOf { it.subscriptionOfferDetails.orEmpty().size })
                    } catch (_: Exception) {
                      finish(BillingClient.BillingResponseCode.ERROR, 0)
                    }
                  }
                }
              } catch (_: Exception) {
                finish(BillingClient.BillingResponseCode.ERROR, 0)
              }
            }
          }
        })
      } catch (_: Exception) {
        finish(BillingClient.BillingResponseCode.ERROR, 0)
      }
    }
  }

  override fun invalidate() {
    handler.post {
      handler.removeCallbacksAndMessages(null)
      runCatching { diagnosticClient?.endConnection() }
      diagnosticClient = null
    }
    super.invalidate()
  }

  companion object {
    const val NAME = "SkillomateBillingDiagnostics"
    private const val TAG = "SkillomateBilling"
    private val identityKeys = setOf("packageName", "productId", "introductoryOfferId", "configuredProductId",
      "configuredBasePlanId", "configuredIntroductoryOfferId", "basePlanId", "offerId", "returnedOfferId", "selectedBasePlanId", "selectedOfferId")
    private val booleanKeys = setOf("diagnosticsEnabled", "accountBindingPresent", "offerTokenPresent",
      "introductoryOfferReturned", "oldValidatorAccepted", "selectedTokenMatchesReturnedOffer", "submittedTokenMatchesSelectedOffer")
    private val numberKeys = setOf("versionCode", "returnedSubscriptionOfferCount", "androidOfferCount", "unifiedOfferCount",
      "offerIndex", "phaseIndex", "phaseCount", "recurrenceMode", "billingCycleCount", "failedPhaseIndex", "responseCode", "productCount")
    private val offerKeys = setOf("productId", "shape", "offerIndex", "basePlanId", "offerId", "returnedOfferId", "offerTokenPresent", "phaseCount")
    private val phaseKeys = setOf("shape", "offerIndex", "phaseIndex", "billingPeriod", "priceCurrencyCode", "formattedPrice", "recurrenceMode", "billingCycleCount")
    private val schemas = mapOf(
      "native_startup" to setOf("diagnosticsEnabled", "versionCode"),
      "js_startup" to setOf("diagnosticsEnabled"),
      "configuration" to setOf("packageName", "productId", "introductoryOfferId", "configuredProductId",
        "configuredBasePlanId", "configuredIntroductoryOfferId", "accountBindingPresent"),
      "raw_product" to setOf("productId", "returnedSubscriptionOfferCount", "androidOfferCount", "unifiedOfferCount"),
      "raw_offer" to offerKeys,
      "raw_phase" to phaseKeys,
      "selection" to setOf("productId", "configuredIntroductoryOfferId", "selectedBasePlanId", "selectedOfferId",
        "introductoryOfferReturned", "introductoryOfferStatus", "rejectionReason"),
      "validation" to setOf("shape", "offerIndex", "basePlanId", "offerId", "rejectionReason", "failedValidationCheck",
        "failedPhaseIndex", "oldValidatorAccepted"),
      "checkout" to setOf("productId", "selectedBasePlanId", "selectedOfferId", "offerTokenPresent",
        "selectedTokenMatchesReturnedOffer", "submittedTokenMatchesSelectedOffer"),
      "native_query" to setOf("productId", "responseCode", "productCount", "returnedSubscriptionOfferCount"),
      "native_offer" to offerKeys,
      "native_phase" to phaseKeys,
    )
    private val identifier = Regex("^[a-zA-Z0-9._-]{1,128}$")
    private val price = Regex("^(?:[A-Z]{0,3}\\s*)?[\\p{Sc}\\s]*[\\p{N}\\s.,'’\\u066b\\u066c]+[\\p{Sc}\\s]*(?:[A-Z]{0,3})$")

    internal fun emit(event: String, values: Map<String, Any?>) {
      if (!BuildConfig.SKILLOMATE_BILLING_DIAGNOSTICS) return
      val schema = schemas[event] ?: return
      val result = JSONObject().put("event", event)
      for (key in schema) {
        val value = values[key]
        val safe = when {
          key in booleanKeys -> value as? Boolean
          key in numberKeys -> (value as? Number)?.toDouble()?.takeIf { it.isFinite() && it % 1.0 == 0.0 }?.toLong()
          key in identityKeys -> (value as? String)?.takeIf { identifier.matches(it) }
          key == "shape" -> (value as? String)?.takeIf { it in setOf("subscriptionOfferDetailsAndroid", "subscriptionOffers", "nativeProductDetails") }
          key == "introductoryOfferStatus" -> (value as? String)?.takeIf { it in setOf("selected", "rejected", "absent") }
          key == "billingPeriod" -> (value as? String)?.takeIf { Regex("^P[0-9]{1,4}[DWMY]$").matches(it) }
          key == "priceCurrencyCode" -> (value as? String)?.takeIf { Regex("^[A-Z]{3}$").matches(it) }
          key == "formattedPrice" -> (value as? String)?.takeIf { it.length <= 64 && price.matches(it) }
          key == "rejectionReason" || key == "failedValidationCheck" -> (value as? String)?.takeIf { validationLabels.contains(it) }
          else -> null
        }
        result.put(key, safe ?: JSONObject.NULL)
      }
      // Each offer/phase is its own small entry, avoiding logcat's message limit.
      Log.i(TAG, "[SkillomateGooglePlayBillingDiagnostics] $result")
    }

    private val validationLabels = setOf(
      "wrong_product_id", "wrong_offer_id", "wrong_base_plan", "wrong_phase_count", "wrong_period", "wrong_recurrence",
      "missing_offer_token", "invalid_price", "invalid_currency", "currency_mismatch", "invalid_phase",
      "offer_not_returned", "missing_formatted_price", "invalid_recurrence_fields", "intro_not_discounted",
      "conflicting_offer_metadata", "matching_token_phase_terms",
      "product_identity", "base_plan_identity", "offer_identity", "offer_token_present", "phase_count", "phase_object",
      "positive_price_micros", "formatted_price", "currency_code", "consistent_currency", "product_currency",
      "intro_period_p3d", "renewal_period_p1m", "recurrence_fields", "intro_single_charge", "renewal_infinite_monthly", "intro_below_renewal",
    )
  }
}
