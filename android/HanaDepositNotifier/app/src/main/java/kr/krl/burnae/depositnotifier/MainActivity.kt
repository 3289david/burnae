package kr.krl.burnae.depositnotifier

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(applicationContext)

        val etServerUrl = findViewById<EditText>(R.id.etServerUrl)
        val etSecret = findViewById<EditText>(R.id.etSecret)
        val etPackageFilter = findViewById<EditText>(R.id.etPackageFilter)
        val etAmountRegex = findViewById<EditText>(R.id.etAmountRegex)
        val etNameRegex = findViewById<EditText>(R.id.etNameRegex)

        etServerUrl.setText(prefs.serverUrl)
        etSecret.setText(prefs.secret)
        etPackageFilter.setText(prefs.packageFilter)
        etAmountRegex.setText(prefs.amountRegex)
        etNameRegex.setText(prefs.nameRegex)

        findViewById<Button>(R.id.btnOpenNotificationSettings).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        findViewById<Button>(R.id.btnSave).setOnClickListener {
            prefs.serverUrl = etServerUrl.text.toString().trim()
            prefs.secret = etSecret.text.toString().trim()
            prefs.packageFilter = etPackageFilter.text.toString().trim()
            prefs.amountRegex = etAmountRegex.text.toString().trim().ifEmpty { DEFAULT_AMOUNT_REGEX }
            prefs.nameRegex = etNameRegex.text.toString().trim().ifEmpty { DEFAULT_NAME_REGEX }
            Toast.makeText(this, "저장됐어요", Toast.LENGTH_SHORT).show()
        }

        refreshStatus()
        refreshLog()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
        refreshLog()
    }

    private fun refreshStatus() {
        val enabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            ?.contains(packageName) == true
        findViewById<TextView>(R.id.tvListenerStatus).text =
            if (enabled) "✅ 알림 접근 권한이 켜져 있어요." else "⚠️ 알림 접근 권한이 꺼져 있어요 — 위 버튼으로 켜주세요."
    }

    private fun refreshLog() {
        findViewById<TextView>(R.id.tvLog).text = prefs.readLog().joinToString("\n").ifEmpty { "(아직 기록된 알림이 없어요)" }
    }
}
