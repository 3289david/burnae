package kr.krl.burnae.depositnotifier

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 하나은행 Open API에는 실시간 웹훅이 없어서(서버 쪽 scripts/maintenance-cron.ts가 10분마다
 * 폴링으로만 입금을 확인함) 휴대폰에 뜨는 하나은행 앱 알림을 그대로 읽어서 즉시 서버로 전달한다.
 *
 * 패키지 필터가 비어있으면 "로그만 남기는 모드"로 동작한다 — 시스템 알림을 전부 훑어서
 * 패키지명/문구를 기록만 하고 아무 데도 전송하지 않는다. 사용자가 로그에서 하나은행 앱의
 * 실제 패키지명을 확인한 뒤 설정에 입력하면 그때부터 해당 패키지의 알림만 파싱해서 전송한다.
 *
 * 은행 알림 문구는 "입금 50,000원 홍길동", "50,000원 입금 홍길동님", "입금 50,000 홍길동"처럼
 * 포맷이 제각각이고 미리 실제 문구를 받아볼 수 없어서, 설정의 정규식(사용자가 직접 고칠 수 있음)을
 * 1순위로 쓰고 안 맞으면 흔한 포맷들을 순서대로 시도하는 여러 겹 fallback으로 처리한다.
 */
class DepositNotificationListenerService : NotificationListenerService() {
    private val timeFmt = SimpleDateFormat("MM/dd HH:mm:ss", Locale.KOREA)

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val prefs = Prefs(applicationContext)
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString() ?: ""
        val subText = extras.getCharSequence(android.app.Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(android.app.Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
        val lines = extras.getCharSequenceArray(android.app.Notification.EXTRA_TEXT_LINES)
            ?.joinToString(" / ") { it.toString() } ?: ""
        val combined = listOf(title, text, subText, bigText, lines).filter { it.isNotBlank() }.joinToString(" / ")
        val timestamp = timeFmt.format(Date())

        val filter = prefs.packageFilter.trim()
        if (filter.isEmpty() || sbn.packageName != filter) {
            prefs.addLog("[$timestamp] (미전송) ${sbn.packageName}: $combined")
            return
        }

        val amount = extractAmount(combined, prefs.amountRegex)
        val name = extractName(combined, prefs.nameRegex)

        if (amount == null || name == null) {
            prefs.addLog("[$timestamp] (파싱 실패: 금액=$amount, 이름=$name) ${sbn.packageName}: $combined")
            return
        }

        val serverUrl = prefs.serverUrl.trim()
        val secret = prefs.secret.trim()
        if (serverUrl.isEmpty() || secret.isEmpty()) {
            prefs.addLog("[$timestamp] (서버/시크릿 미설정) 입금 $amount 원 · $name")
            return
        }

        Thread {
            val result = DepositUploader.send(serverUrl, secret, name, amount)
            val outcome = result.fold(
                onSuccess = { code -> "HTTP $code" },
                onFailure = { err -> "오류: ${err.message}" },
            )
            prefs.addLog("[$timestamp] 전송: 입금 $amount 원 · $name → $outcome")
            Log.i("DepositListener", "입금 $amount 원 / $name → $outcome")
        }.start()
    }

    companion object {
        /** 설정의 커스텀 정규식을 1순위로 쓰고, 안 맞으면 흔한 문구 포맷들을 순서대로 시도한다 */
        private val AMOUNT_FALLBACK_PATTERNS = listOf(
            Regex("입금\\s*([0-9][0-9,]*)\\s*원"),   // "입금 50,000원"
            Regex("([0-9][0-9,]*)\\s*원\\s*입금"),   // "50,000원 입금"
            Regex("입금\\s*([0-9][0-9,]*)(?!\\d)"),  // "입금 50,000 홍길동" (원 없이)
        )

        /** 계좌번호/날짜/잔액 등 숫자 뒤에 한글이 붙어 있어도 이름으로 착각하지 않게 흔한 단어는 제외 */
        private val NAME_EXCLUDE = setOf("은행", "계좌", "잔액", "누적", "수신", "입금", "출금", "거래", "하나")
        private val NAME_FALLBACK_PATTERNS = listOf(
            Regex("([가-힣]{2,10})\\s*님"),                  // "홍길동님"
            Regex("입금자\\s*[:：]?\\s*([가-힣]{2,10})"),      // "입금자: 홍길동" / "입금자명 홍길동"
            Regex("원\\s*([가-힣]{2,10})"),                  // "...원 홍길동"
            Regex("[0-9][0-9,]*\\s+([가-힣]{2,10})(?:\\s|$)"), // "50,000 홍길동" (숫자 바로 뒤 한글)
        )

        fun extractAmount(text: String, customRegex: String): Long? {
            Regex(customRegex).find(text)?.groupValues?.getOrNull(1)
                ?.replace(",", "")?.toLongOrNull()?.let { return it }
            for (pattern in AMOUNT_FALLBACK_PATTERNS) {
                pattern.find(text)?.groupValues?.getOrNull(1)?.replace(",", "")?.toLongOrNull()?.let { return it }
            }
            return null
        }

        fun extractName(text: String, customRegex: String): String? {
            Regex(customRegex).find(text)?.groupValues?.getOrNull(1)
                ?.takeIf { it !in NAME_EXCLUDE }?.let { return it }
            for (pattern in NAME_FALLBACK_PATTERNS) {
                val candidate = pattern.find(text)?.groupValues?.getOrNull(1)
                if (candidate != null && candidate !in NAME_EXCLUDE) return candidate
            }
            return null
        }
    }
}
