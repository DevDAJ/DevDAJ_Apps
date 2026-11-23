package tech.devdaj.appdata

import android.database.Cursor
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

internal class AppUnavailableException(app: String) :
  CodedException("ERR_APP_UNAVAILABLE", "$app isn't installed or has no shared data.", null)

internal class AppForbiddenException(app: String) :
  CodedException("ERR_APP_FORBIDDEN", "$app is signed with a different key.", null)

class AppDataModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available." }

  override fun definition() = ModuleDefinition {
    Name("DevdajAppData")

    Constant("appName") { AppDataPaths.appName(context) }

    Constant("appsDirectory") { AppDataPaths.appsDirectory(context).path }

    Function("databaseExists") { app: String ->
      AppDataPaths.isValidAppName(app) &&
        app == AppDataPaths.appName(context) &&
        AppDataPaths.database(context, app).exists()
    }

    AsyncFunction("queryApp") { app: String, sql: String, args: List<String> ->
      require(AppDataPaths.isValidAppName(app)) { "Invalid app name \"$app\"." }
      val uri = Uri.parse("content://${AppDataPaths.authorityOf(app)}/query")
      val cursor = try {
        context.contentResolver.query(uri, null, sql, args.toTypedArray(), null)
      } catch (_: SecurityException) {
        throw AppForbiddenException(app)
      } ?: throw AppUnavailableException(app)
      cursor.use(::readRows)
    }
  }

  private fun readRows(cursor: Cursor): List<Map<String, Any?>> {
    val columns = cursor.columnNames
    val rows = ArrayList<Map<String, Any?>>(cursor.count.coerceAtLeast(0))
    while (cursor.moveToNext()) {
      val row = LinkedHashMap<String, Any?>(columns.size)
      columns.forEachIndexed { index, name ->
        row[name] = when (cursor.getType(index)) {
          Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(index).toDouble()
          Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(index)
          Cursor.FIELD_TYPE_STRING -> cursor.getString(index)
          else -> null // NULL; BLOBs aren't shared across apps
        }
      }
      rows.add(row)
    }
    return rows
  }
}
