package kr.krl.burnae.depositnotifier

import android.content.Context
import org.json.JSONArray

/** 기본 금액 정규식 — "입금 100,000원" 형태에서 숫자만 뽑음. 은행 알림 문구가 바뀌면 설정 화면에서 바로 고칠 수 있음 */
const val DEFAULT_AMOUNT_REGEX = "입금\\s*([0-9,]+)\\s*원"

/** 기본 입금자명 정규식 — 금액(원) 바로 뒤에 오는 한글 이름을 추정해서 뽑음. 실제 알림 문구를 보고 조정 필요 */
const val DEFAULT_NAME_REGEX = "원\\s*([가-힣]{2,10})"

private const val PREFS_NAME = "deposit_notifier_prefs"
private const val MAX_LOG_ENTRIES = 20

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString("serverUrl", "") ?: ""
        set(value) = sp.edit().putString("serverUrl", value).apply()

    var secret: String
        get() = sp.getString("secret", "") ?: ""
        set(value) = sp.edit().putString("secret", value).apply()

    var packageFilter: String
        get() = sp.getString("packageFilter", "") ?: ""
        set(value) = sp.edit().putString("packageFilter", value).apply()

    var amountRegex: String
        get() = sp.getString("amountRegex", DEFAULT_AMOUNT_REGEX) ?: DEFAULT_AMOUNT_REGEX
        set(value) = sp.edit().putString("amountRegex", value).apply()

    var nameRegex: String
        get() = sp.getString("nameRegex", DEFAULT_NAME_REGEX) ?: DEFAULT_NAME_REGEX
        set(value) = sp.edit().putString("nameRegex", value).apply()

    /** 최근 처리한 알림을 최대 MAX_LOG_ENTRIES개까지 최신순으로 쌓아둔다(디버깅/패키지명 확인용) */
    fun addLog(line: String) {
        val arr = JSONArray(sp.getString("log", "[]"))
        val next = JSONArray()
        next.put(line)
        for (i in 0 until minOf(arr.length(), MAX_LOG_ENTRIES - 1)) next.put(arr.getString(i))
        sp.edit().putString("log", next.toString()).apply()
    }

    fun readLog(): List<String> {
        val arr = JSONArray(sp.getString("log", "[]"))
        return (0 until arr.length()).map { arr.getString(it) }
    }
}
