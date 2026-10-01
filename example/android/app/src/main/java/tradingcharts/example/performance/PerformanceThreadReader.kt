package tradingcharts.example.performance

import android.os.Process
import android.system.Os
import android.system.OsConstants
import java.io.File
import java.io.IOException

data class PerformanceThread(
    val id: String,
    val name: String,
    val startTicks: Long?,
    val cpuSeconds: Double?,
    val isMainThread: Boolean,
    val isJSThread: Boolean,
) {
  fun metadata(): Map<String, Any?> =
      mapOf("id" to id, "name" to name, "isMainThread" to isMainThread, "isJSThread" to isJSThread)
}

internal object PerformanceThreadReader {
  private val whitespace = Regex("\\s+")

  fun read(jsTid: Int?): List<PerformanceThread>? =
      try {
        val clockTicks = Os.sysconf(OsConstants._SC_CLK_TCK).toDouble()
        readDirectory(File("/proc/self/task"), clockTicks, Process.myPid(), jsTid)
      } catch (_: android.system.ErrnoException) {
        null
      } catch (_: SecurityException) {
        null
      }

  fun readDirectory(
      directory: File,
      clockTicks: Double,
      mainTid: Int,
      jsTid: Int?,
  ): List<PerformanceThread>? {
    val entries = directory.listFiles() ?: return null
    return entries
        .mapNotNull { task ->
          val tid = task.name.toIntOrNull() ?: return@mapNotNull null
          val stat = readText(File(task, "stat"))
          parse(stat, clockTicks, mainTid, jsTid)
              ?: PerformanceThread(
                  tid.toString(),
                  readText(File(task, "comm"))?.trimEnd('\n') ?: "",
                  null,
                  null,
                  tid == mainTid,
                  tid == jsTid,
              )
        }
        .sortedBy { it.id.toInt() }
  }

  private fun readText(file: File): String? =
      try {
        file.readText()
      } catch (_: IOException) {
        null
      } catch (_: SecurityException) {
        null
      }

  fun parse(stat: String?, clockTicks: Double, mainTid: Int, jsTid: Int?): PerformanceThread? {
    if (stat == null || !clockTicks.isFinite() || clockTicks <= 0) return null
    val opening = stat.indexOf('(')
    val closing = stat.lastIndexOf(')')
    val tid = stat.substringBefore('(').trim().toIntOrNull()
    if (opening < 1 || closing <= opening || tid == null) return null
    val fields = stat.substring(closing + 1).trim().split(whitespace)
    val user = fields.getOrNull(11)?.toLongOrNull()?.takeIf { it >= 0 }
    val system = fields.getOrNull(12)?.toLongOrNull()?.takeIf { it >= 0 }
    val start = fields.getOrNull(19)?.toLongOrNull()
    val cpu =
        if (user != null && system != null) {
          (user.toDouble() + system.toDouble()) / clockTicks
        } else null
    return PerformanceThread(
        tid.toString(),
        stat.substring(opening + 1, closing),
        start,
        cpu,
        tid == mainTid,
        tid == jsTid,
    )
  }
}
