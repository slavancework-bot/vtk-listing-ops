import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.skip(!process.env.PHASE2_E2E, "Requires the explicit disposable PostgreSQL staging path.");

test("generated Phase 3 question is answered through the Employee Work Screen and revalidated in PostgreSQL", async ({ page, request }, testInfo) => {
  const headers = { "x-development-user": "development-employee" };
  const api = "http://127.0.0.1:4174/api";
  const content = await readFile(new URL("../../../fixtures/phase3-sixbit-v1.csv", import.meta.url), "utf8");
  const imported = await request.post(`${api}/phase3/batches/import`, { headers, data: { importKey: `phase3-browser-${testInfo.project.name}`, filename: "phase3-sixbit-v1.csv", mimeType: "text/csv", content } });
  expect(imported.status()).toBe(201);
  const { batchId } = await imported.json() as { batchId: string };
  const analyzed = await request.post(`${api}/phase3/batches/${batchId}/analyze`, { headers });
  expect(analyzed.status()).toBe(200);

  await page.goto(`/phase3/employee?batchId=${batchId}`);
  await expect(page.getByTestId("phase3-employee-work-screen")).toBeVisible();
  const label = "Enter the verified R2/custom code, or NONE when the approved semantics apply.";
  await page.getByLabel(label).fill("R2-F3-BROWSER-VERIFIED");
  await page.getByLabel(label).locator("xpath=ancestor::section").getByRole("button", { name: "Save answers and revalidate" }).click();
  await expect(page.getByRole("status")).toContainText("Answers saved and deterministic rules revalidated.");

  const { pool } = await import("@workspace/db");
  const saved = await pool.query<{ employee_answers: Record<string, unknown>; normalized_values: Record<string, unknown> }>("select la.employee_answers,la.normalized_values from listing_analyses la join listing_items li on li.id=la.item_id where li.batch_id=$1 and la.employee_answers ? 'q:r2.required'", [batchId]);
  expect(saved.rowCount).toBe(1);
  expect(saved.rows[0].employee_answers["q:r2.required"]).toBe("R2-F3-BROWSER-VERIFIED");
  expect(saved.rows[0].normalized_values.r2Code).toBe("R2-F3-BROWSER-VERIFIED");
});
