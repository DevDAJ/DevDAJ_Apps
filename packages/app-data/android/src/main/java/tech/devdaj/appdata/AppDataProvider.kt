package tech.devdaj.appdata

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.sqlite.SQLiteCursor
import android.database.sqlite.SQLiteDatabase
import android.net.Uri

/**
 * Lets other DevDAJ apps run read-only queries on this app's data.db:
 * `content://tech.devdaj.app.<app>.appdata/query`, SQL in `selection`, tagged args in `selectionArgs`.
 * Android only lets apps holding the signature permission (same signing key) call it.
 */
class AppDataProvider : ContentProvider() {
  @Volatile private var database: SQLiteDatabase? = null

  override fun onCreate() = true

  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String?>?,
    sortOrder: String?,
  ): Cursor? {
    require(uri.pathSegments == listOf("query")) { "Unknown path $uri." }
    val sql = requireNotNull(selection) { "Missing SQL." }
    val args = selectionArgs.orEmpty().map(QueryArg::decode)
    val db = openDatabase() ?: return null
    return db.rawQueryWithFactory(
      { _, driver, editTable, query ->
        args.forEachIndexed { index, arg ->
          val position = index + 1
          when (arg) {
            QueryArg.Null -> query.bindNull(position)
            is QueryArg.Integer -> query.bindLong(position, arg.value)
            is QueryArg.Real -> query.bindDouble(position, arg.value)
            is QueryArg.Text -> query.bindString(position, arg.value)
          }
        }
        SQLiteCursor(driver, editTable, query)
      },
      sql,
      null,
      null,
    )
  }

  /**
   * One connection for the life of the process, never closed: this process also writes the file
   * through expo-sqlite's own SQLite copy, and closing a second copy's file handle would drop the
   * writer's file locks. `query_only` makes the connection unable to change anything.
   */
  @Synchronized
  private fun openDatabase(): SQLiteDatabase? {
    database?.let { return it }
    val context = context ?: return null
    val app = AppDataPaths.appName(context) ?: return null
    val file = AppDataPaths.database(context, app)
    if (!file.exists()) return null
    val flags = SQLiteDatabase.OPEN_READWRITE or
      SQLiteDatabase.ENABLE_WRITE_AHEAD_LOGGING or // keep the file in WAL mode, as the app opens it
      SQLiteDatabase.NO_LOCALIZED_COLLATORS // don't create android_metadata in the app's database
    return SQLiteDatabase.openDatabase(file.path, null, flags).also { db ->
      db.rawQuery("PRAGMA query_only = 1", null).use { it.moveToFirst() }
      db.rawQuery("PRAGMA busy_timeout = 3000", null).use { it.moveToFirst() }
      database = db
    }
  }

  override fun getType(uri: Uri): String? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = readOnly()

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
    readOnly()

  override fun update(
    uri: Uri,
    values: ContentValues?,
    selection: String?,
    selectionArgs: Array<out String>?,
  ): Int = readOnly()

  private fun readOnly(): Nothing =
    throw UnsupportedOperationException("DevDAJ app data is read-only for other apps.")
}
