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
 */
class DepositNotificationListenerService : NotificationListenerService() {
    private val timeFmt = SimpleDateFormat("MM/dd HH:mm:ss", Locale.KOREA)

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val prefs = Prefs(applicationContext)
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(android.app.Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
        val combined = listOf(title, text, bigText).filter { it.isNotBlank() }.joinToString(" / ")
        val timestamp = timeFmt.format(Date())

        val filter = prefs.packageFilter.trim()
        if (filter.isEmpty() || sbn.packageName != filter) {
            prefs.addLog("[$timestamp] (미전송) ${sbn.packageName}: $combined")
            return
        }

        val amount = Regex(prefs.amountRegex).find(combined)?.groupValues?.getOrNull(1)?.replace(",", "")?.toLongOrNull()
        val name = Regex(prefs.nameRegex).find(combined)?.groupValues?.getOrNull(1)

        if (amount == null || name == null) {
            prefs.addLog("[$timestamp] (파싱 실패) ${sbn.packageName}: $combined")
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
}
