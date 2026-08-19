import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.goto("/employee"); });

test("all eight approved scenarios are reachable without page scrolling", async ({ page }) => {
  const skus = ["VTK-00623", "VTK-C1111-4P-14", "VTK-00331", "VTK-00742", "VTK-00219", "VTK-00512", "VTK-00408", "VTK-00887"];
  for (let index = 0; index < skus.length; index += 1) {
    await expect(page.getByText(`SKU: ${skus[index]}`, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    if (index < skus.length - 1) await page.getByTestId("btn-next-item").click();
  }
});

test("F1 traps and restores focus while background shortcuts stay disabled", async ({ page }) => {
  await page.getByTestId("btn-next-item").focus(); await page.keyboard.press("F1");
  const dialog = page.getByRole("dialog", { name: "Keyboard Shortcuts" }); await expect(dialog).toBeFocused();
  await page.keyboard.press("1"); await expect(page.getByText("NONE OF THESE ARE INCLUDED")).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.getByTestId("btn-next-item")).toBeFocused();
});

test("quantity zero blocks save and valid quantity allows exactly one transition", async ({ page }) => {
  for (let i = 0; i < 3; i += 1) await page.getByTestId("btn-next-item").click();
  await page.getByRole("button", { name: "−" }).click();
  await page.getByTestId("btn-condition-D").click();
  await expect(page.getByTestId("btn-save-next")).toBeDisabled();
  await page.getByRole("button", { name: "+" }).click();
  await page.getByTestId("btn-save-next").click();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Item 5 of 8")).toBeVisible();
});

test("F2 processes each item once and batch completes only after pending reaches zero", async ({ page }) => {
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("F2");
    if (index < 7) await expect(page.getByText(`Item ${index + 2} of 8`)).toBeVisible({ timeout: 3000 });
  }
  await expect(page.getByRole("heading", { name: "Batch Complete" })).toBeVisible();
  await expect(page.getByText("8", { exact: true }).first()).toBeVisible();
});
