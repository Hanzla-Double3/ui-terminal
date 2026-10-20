import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
async function command(page: Page, text: string) {
  const panel = page.getByRole("region", { name: "UI terminal" });
  const before = await panel.getAttribute("data-last-command");
  const input = page.getByRole("textbox", { name: "Terminal command" });
  await input.fill(text);
  await input.press("Enter");
  await expect(panel).not.toHaveAttribute("data-last-command", before ?? "");
  await expect(panel).toHaveAttribute(
    "data-last-event",
    /command.finished|command.rejected|action.failed/,
  );
  await expect(page.locator(".uit-stream")).toContainText("local");
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Terminal command" }),
  ).toBeEnabled();
});

test("discovers declarative controls and executes the real search/Enter/cart handlers", async ({
  page,
}) => {
  await command(page, "ls");
  await expect(page.getByRole("log")).toContainText("search");
  await expect(page.getByRole("log")).toContainText(
    "shared navigation controls",
  );
  await command(page, 'search.type("Field")');
  await expect(
    page.getByRole("textbox", { name: "Search catalogue" }),
  ).toHaveValue("Field");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await command(page, 'search.press("Enter")');
  await expect(page.getByTestId("cart-total")).toHaveText("$12.00");
  await expect(
    page.getByRole("textbox", { name: "Search catalogue" }),
  ).toHaveValue("");
  await command(page, 'cart.items["line-notes"].increase.click()');
  await expect(page.getByTestId("cart-total")).toHaveText("$24.00");
  await command(page, 'cart.items["line-notes"].remove.click()');
  await expect(page.getByTestId("cart-total")).toHaveText("$0.00");
});

test("physical clicks and terminal activation share exactly one handler", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Field Notes/ }).click();
  await expect(page.getByTestId("cart-total")).toHaveText("$12.00");
  await command(page, "products.notes.add.click()");
  await expect(page.getByTestId("cart-total")).toHaveText("$24.00");
  await command(page, "cart.save.click()");
  await expect(page.getByRole("log")).toContainText(
    "Collection saved to this browser.",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ui-terminal-demo-collection")!),
  );
  expect(saved.cart[0].quantity).toBe(2);
  await expect(page.getByRole("log")).toContainText('"persistence":"local"');
});

test("scoped deltas show only changed controls, not unchanged navigation", async ({
  page,
}) => {
  await command(page, "ls cart");
  await page.getByRole("button", { name: /Field Notes/ }).click();
  await command(page, "ls --changes");
  await expect(page.getByRole("log")).toContainText("+ cart.items");
  await expect(
    page.locator(".uit-delta").filter({ hasText: "navigation.settings" }),
  ).toHaveCount(0);
});

test("active dialog isolates background controls and allows safe rename", async ({
  page,
}) => {
  await command(page, "cart.name.right_click()");
  await expect(page.getByRole("dialog")).toBeVisible();
  await command(page, "ls");
  await expect(page.getByRole("log")).toContainText("dialog.name");
  await command(page, "products.notes.add.click()");
  await expect(page.getByRole("log")).toContainText("NOT_FOUND");
  await command(page, 'dialog.name.type("Desk setup")');
  await command(page, "dialog.save.click()");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".collection-name")).toContainText("Desk setup");
  await command(page, "cart.name.hold()");
  await expect(page.getByRole("dialog")).toBeVisible();
  await command(page, "dialog.cancel.click()");
});

test("clear confirmation never bypasses the normal modal", async ({ page }) => {
  await page.getByRole("button", { name: /Field Notes/ }).click();
  await command(page, "cart.clear.click()");
  await expect(
    page.getByRole("dialog", { name: "Clear this collection?" }),
  ).toBeVisible();
  await command(page, "dialog.cancel.click()");
  await expect(page.getByTestId("cart-total")).toHaveText("$12.00");
  await command(page, "cart.clear.click()");
  await command(page, "dialog.confirm.click()");
  await expect(page.getByTestId("cart-total")).toHaveText("$0.00");
});

test("shared navigation remains callable, inactive screens and secret fields stay excluded", async ({
  page,
}) => {
  await command(page, "navigation.settings.click()");
  await expect(
    page.getByRole("heading", { name: "A few preferences." }),
  ).toBeVisible();
  await command(page, "ls --all");
  const listing = page.locator(".uit-snapshot").last();
  await expect(listing).toContainText("theme");
  await expect(listing).not.toContainText("private_value");
  await expect(listing).not.toContainText("products.notes");
  await command(page, 'search.type("not on screen")');
  await expect(page.getByRole("log")).toContainText("NOT_FOUND");
  await command(page, "theme.click()");
  await expect(page.locator(".lab")).toHaveClass(/dark/);
});

test("failed commands are recalled with Up, completion uses discovered paths", async ({
  page,
}) => {
  await command(page, "missing.click()");
  const input = page.getByRole("textbox", { name: "Terminal command" });
  await input.press("ArrowUp");
  await expect(input).toHaveValue("missing.click()");
  await input.fill("");
  await command(page, "ls");
  await input.fill("search.ty");
  await input.press("Tab");
  await expect(input).toHaveValue('search.type("")');
  await input.fill("products.j");
  await input.press("Tab");
  await expect(input).toHaveValue("products.journal.");
  await input.press("Tab");
  await expect(input).toHaveValue("products.journal.add");
  await input.press("Tab");
  await expect(input).toHaveValue("products.journal.add");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "products.journal.add.click()" }),
  ).toBeVisible();
});

test("terminal resizes, minimizes and restores its chosen height", async ({
  page,
}) => {
  const panel = page.getByRole("region", { name: "UI terminal" });
  const separator = page.getByRole("separator", { name: "Resize terminal" });
  const before = await panel.boundingBox();
  await separator.focus();
  await separator.press("ArrowUp");
  await expect(separator).toHaveAttribute("aria-valuenow", "225");
  const expanded = await panel.boundingBox();
  expect(expanded!.height).toBeGreaterThan(before!.height);
  await page.getByRole("button", { name: "Minimize terminal" }).click();
  await expect(
    page.getByRole("textbox", { name: "Terminal command" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Expand terminal" }).click();
  await expect(separator).toHaveAttribute("aria-valuenow", "225");
});

test("disabling and reopening resets terminal scope state without clearing the collection", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Field Notes/ }).click();
  await command(page, "navigation.settings.click()");
  await page.getByRole("button", { name: "Disable terminal" }).click();
  await expect(
    page.getByRole("textbox", { name: "Terminal command" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open terminal" }).click();
  await expect(
    page.getByRole("textbox", { name: "Terminal command" }),
  ).toBeEnabled();
  await expect(page.getByRole("log")).not.toContainText(
    "navigation.settings.click()",
  );
  await command(page, "navigation.playground.click()");
  await expect(page.getByTestId("cart-total")).toHaveText("$12.00");
});

test("narrow viewport keeps input usable and has no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await command(page, "ls");
  await expect(
    page.getByRole("textbox", { name: "Terminal command" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("an explicit focus command leaves focus on the requested application field", async ({
  page,
}) => {
  await command(page, "search.focus()");
  await expect(
    page.getByRole("textbox", { name: "Search catalogue" }),
  ).toBeFocused();
  await command(page, "missing.click()");
  await expect(
    page.getByRole("textbox", { name: "Terminal command" }),
  ).toBeFocused();
});
