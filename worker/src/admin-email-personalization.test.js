import assert from "node:assert/strict";
import test from "node:test";

import { substitutePersonalization } from "./index.js";

test("first-name personalization accepts the documented underscore token", () => {
  assert.equal(
    substitutePersonalization("Hello {first_name},", { firstName: "JIM" }),
    "Hello Jim,"
  );
});

test("first-name personalization accepts the space alias", () => {
  assert.equal(
    substitutePersonalization("{first name},", { firstName: "JIM" }),
    "Jim,"
  );
});

test("a missing first name removes the token and its trailing comma", () => {
  assert.equal(substitutePersonalization("{first_name},\n\nWelcome."), "\n\nWelcome.");
});
