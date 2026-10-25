import assert from "node:assert/strict";
import test from "node:test";
import { IOS_INSTALL_COPY, iosHintVisible, iosSafari } from "../install.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAC_SAFARI = IPAD_DESKTOP;
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1";

test("the iOS hint is Safari only, and dismissal or standalone hides it", () => {
  assert.equal(IOS_INSTALL_COPY, "Install: tap Share (square with arrow), then Add to Home Screen");
  assert.equal(iosSafari(IPHONE), true);
  assert.equal(iosSafari(IPAD_DESKTOP, { platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(iosSafari(MAC_SAFARI, { platform: "MacIntel", maxTouchPoints: 0 }), false);
  assert.equal(iosSafari(CHROME), false);
  assert.equal(iosSafari(CHROME_IOS), false);

  assert.equal(iosHintVisible({ ua: IPHONE }), true);
  assert.equal(iosHintVisible({ ua: IPHONE, dismissed: true }), false);
  assert.equal(iosHintVisible({ ua: IPHONE, standalone: true }), false);
  assert.equal(iosHintVisible({ ua: CHROME }), false);
});
