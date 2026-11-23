package tech.devdaj.appdata

import android.content.Context
import android.content.pm.PackageManager
import java.io.File

/** Where this app keeps its shared database: `<files>/devdaj/<app>/data.db`. */
internal object AppDataPaths {
  const val META_APP_NAME = "tech.devdaj.appdata.APP_NAME"
  const val DATABASE_FILE = "data.db"
  const val APP_ID_PREFIX = "tech.devdaj.app."
  const val AUTHORITY_SUFFIX = ".appdata"
  private val APP_NAME = Regex("^[a-z][a-z0-9_]{0,63}$")

  fun isValidAppName(app: String) = APP_NAME.matches(app)

  fun appsDirectory(context: Context): File = File(context.filesDir, "devdaj")

  fun appName(context: Context): String? {
    val info = context.packageManager.getApplicationInfo(
      context.packageName,
      PackageManager.GET_META_DATA,
    )
    return info.metaData?.getString(META_APP_NAME)?.takeIf(::isValidAppName)
  }

  fun database(context: Context, app: String): File =
    File(File(appsDirectory(context), app), DATABASE_FILE)

  fun authorityOf(app: String) = "$APP_ID_PREFIX$app$AUTHORITY_SUFFIX"
}
