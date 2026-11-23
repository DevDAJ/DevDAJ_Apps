package tech.devdaj.appdata

/**
 * ContentProvider arguments are strings, so values travel tagged with their SQLite type
 * (`n:` null, `i:` integer, `r:` real, `t:` text) and are bound with that type again.
 */
internal sealed interface QueryArg {
  data object Null : QueryArg
  data class Integer(val value: Long) : QueryArg
  data class Real(val value: Double) : QueryArg
  data class Text(val value: String) : QueryArg

  companion object {
    fun decode(raw: String?): QueryArg {
      requireNotNull(raw) { "Query argument is missing." }
      val value = raw.substring(2)
      return when (raw.take(2)) {
        "n:" -> Null
        "i:" -> Integer(value.toLong())
        "r:" -> Real(value.toDouble())
        "t:" -> Text(value)
        else -> throw IllegalArgumentException("Unknown query argument \"$raw\".")
      }
    }
  }
}
