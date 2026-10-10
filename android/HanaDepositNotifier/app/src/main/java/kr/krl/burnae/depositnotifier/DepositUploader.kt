package kr.krl.burnae.depositnotifier

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object DepositUploader {
    private const val TAG = "DepositUploader"

    /** 백그라운드 스레드에서 호출해야 함(네트워크 I/O) */
    fun send(serverUrl: String, secret: String, depositorName: String, amountKrw: Long): Result<Int> {
        return try {
            val url = URL(serverUrl)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            conn.setRequestProperty("x-hanabank-notify-secret", secret)
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.doOutput = true

            val body = JSONObject().apply {
                put("depositorName", depositorName)
                put("amountKrw", amountKrw)
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val responseText = stream?.bufferedReader()?.use { it.readText() } ?: ""
            Log.i(TAG, "서버 응답 $code: $responseText")
            conn.disconnect()
            Result.success(code)
        } catch (err: Exception) {
            Log.e(TAG, "전송 실패", err)
            Result.failure(err)
        }
    }
}
