// @ts-check
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withEntitlementsPlist,
  withInfoPlist,
} = require("expo/config-plugins");

// Keep in sync with src/shared.ts (a test checks this).
const APP_ID_PREFIX = "tech.devdaj.app";
const APP_GROUP = "group.tech.devdaj.shared";
const AUTHORITY_SUFFIX = ".appdata";
const META_APP_NAME = "tech.devdaj.appdata.APP_NAME";
const APP_NAME = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * @typedef {{ app: string; readsFrom?: string[] }} AppDataPluginOptions
 * - `app`: this app's folder name; its ids must be `tech.devdaj.app.<app>`.
 * - `readsFrom`: other apps whose data this app reads (Android needs them listed to see them).
 */

/** @param {AppDataPluginOptions} options */
function validate(options) {
  if (!options || typeof options.app !== "string" || !APP_NAME.test(options.app)) {
    throw new Error(
      '@devdaj/app-data: set the plugin option "app" to a lowercase name, e.g. ["@devdaj/app-data", { "app": "fitnexx" }].',
    );
  }
  const readsFrom = options.readsFrom ?? [];
  for (const other of readsFrom) {
    if (typeof other !== "string" || !APP_NAME.test(other)) {
      throw new Error(`@devdaj/app-data: "${other}" in readsFrom is not a valid app name.`);
    }
  }
  return { app: options.app, readsFrom: readsFrom.filter((other) => other !== options.app) };
}

/**
 * Apps find each other by id, so ids must follow `tech.devdaj.app.<app>`.
 * @param {string} kind @param {string | undefined} actual @param {string} app
 */
function checkId(kind, actual, app) {
  const expected = `${APP_ID_PREFIX}.${app}`;
  if (actual && actual !== expected) {
    throw new Error(`@devdaj/app-data: ${kind} must be "${expected}" (found "${actual}").`);
  }
}

/** @param {Record<string, any>} entitlements */
function applyEntitlements(entitlements) {
  const key = "com.apple.security.application-groups";
  const groups = Array.isArray(entitlements[key]) ? entitlements[key] : [];
  entitlements[key] = groups.includes(APP_GROUP) ? groups : [...groups, APP_GROUP];
  return entitlements;
}

/** @param {Record<string, any>} infoPlist @param {string} app */
function applyInfoPlist(infoPlist, app) {
  infoPlist.DevdajAppName = app;
  infoPlist.DevdajAppGroup = APP_GROUP;
  return infoPlist;
}

/**
 * Adds this app's name and lets it see the providers of the apps it reads (Android 11+ hides
 * other apps by default). The provider and permission come from the library's own manifest.
 * @param {any} manifest @param {{ app: string; readsFrom: string[] }} options
 */
function applyAndroidManifest(manifest, { app, readsFrom }) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, META_APP_NAME, app);

  const root = manifest.manifest;
  root.queries = root.queries ?? [];
  const authorities = new Set(
    root.queries.flatMap((/** @type {any} */ query) =>
      (query.provider ?? []).map(
        (/** @type {any} */ provider) => provider.$["android:authorities"],
      ),
    ),
  );
  const missing = readsFrom
    .map((other) => `${APP_ID_PREFIX}.${other}${AUTHORITY_SUFFIX}`)
    .filter((authority) => !authorities.has(authority));
  if (missing.length > 0) {
    root.queries.push({
      provider: missing.map((authority) => ({ $: { "android:authorities": authority } })),
    });
  }
  return manifest;
}

/** @type {import("expo/config-plugins").ConfigPlugin<AppDataPluginOptions>} */
const withAppData = (config, rawOptions) => {
  const options = validate(rawOptions);
  checkId("ios.bundleIdentifier", config.ios?.bundleIdentifier, options.app);
  checkId("android.package", config.android?.package, options.app);

  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults = applyEntitlements(mod.modResults);
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    mod.modResults = applyInfoPlist(mod.modResults, options.app);
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = applyAndroidManifest(mod.modResults, options);
    return mod;
  });
  return config;
};

module.exports = Object.assign(createRunOncePlugin(withAppData, "@devdaj/app-data", "0.1.0"), {
  /** For tests. */
  internal: {
    APP_ID_PREFIX,
    APP_GROUP,
    AUTHORITY_SUFFIX,
    validate,
    checkId,
    applyEntitlements,
    applyInfoPlist,
    applyAndroidManifest,
  },
});
