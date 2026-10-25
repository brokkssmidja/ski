/** Home-screen install hint. iOS Safari has no beforeinstallprompt. */

export const IOS_INSTALL_COPY = "Install: tap Share (square with arrow), then Add to Home Screen";
export const IOS_DISMISS_KEY = "ski-ios-install";

/** iPhone, iPod, iPad, or an iPad that reports itself as a Mac. Not Chrome or Firefox on iOS. */
export function iosSafari(ua, { platform = "", maxTouchPoints = 0 } = {}) {
  const agent = ua || "";
  const iosDevice = /iPad|iPhone|iPod/.test(agent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const safari = /Safari/.test(agent) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/.test(agent);
  return iosDevice && safari;
}

export function standaloneDisplay({ navigatorStandalone = false, displayMode = "" } = {}) {
  return navigatorStandalone === true || displayMode === "standalone";
}

/** The iOS hint is for Safari outside the installed app, until the person dismisses it. */
export function iosHintVisible({ ua, platform = "", maxTouchPoints = 0, standalone = false, dismissed = false }) {
  if (standalone || dismissed) return false;
  return iosSafari(ua, { platform, maxTouchPoints });
}
