import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.skip(
  !process.env.PHASE2_E2E,
  "Requires the explicit disposable PostgreSQL staging path.",
);

test("generated Phase 3 question is answered through the Employee Work Screen and revalidated in PostgreSQL", async ({
  page,
  request,
}, testInfo) => {
  const headers = { "x-development-user": "development-employee" };
  const api = "http://127.0.0.1:4174/api";
  const content = (
    await readFile(
      new URL("../../../fixtures/phase3-sixbit-v1.csv", import.meta.url),
      "utf8",
    )
  ).replace(
    "NEW Zebra ZT410 Industrial Thermal Label Printer 203dpi USB Ethernet with Cable",
    "NEW Synthetic Reviewer Title",
  );
  const imported = await request.post(`${api}/phase3/batches/import`, {
    headers,
    data: {
      importKey: `phase3-browser-${testInfo.project.name}`,
      filename: "phase3-sixbit-v1.csv",
      mimeType: "text/csv",
      content,
    },
  });
  expect(imported.status()).toBe(201);
  const { batchId } = (await imported.json()) as { batchId: string };
  const analyzed = await request.post(
    `${api}/phase3/batches/${batchId}/analyze`,
    { headers },
  );
  expect(analyzed.status()).toBe(200);

  await page.goto(`/phase3/employee?batchId=${batchId}`);
  await expect(page.getByTestId("phase3-employee-work-screen")).toBeVisible();
  const label =
    "Enter the verified R2/custom code, or NONE when the approved semantics apply.";
  await page.getByLabel(label).fill("R2-F3-BROWSER-VERIFIED");
  await page
    .getByLabel(label)
    .locator("xpath=ancestor::section")
    .getByRole("button", { name: "Save answers and revalidate" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Answers saved and deterministic rules revalidated.",
  );

  const { pool } = await import("@workspace/db");
  const saved = await pool.query<{
    employee_answers: Record<string, unknown>;
    normalized_values: Record<string, unknown>;
  }>(
    "select la.employee_answers,la.normalized_values from listing_analyses la join listing_items li on li.id=la.item_id where li.batch_id=$1 and la.employee_answers ? 'q:r2.required'",
    [batchId],
  );
  expect(saved.rowCount).toBe(1);
  expect(saved.rows[0].employee_answers["q:r2.required"]).toBe(
    "R2-F3-BROWSER-VERIFIED",
  );
  expect(saved.rows[0].normalized_values.r2Code).toBe("R2-F3-BROWSER-VERIFIED");

  const workResponse = await request.get(
    `${api}/phase3/batches/${batchId}/work?limit=200`,
    { headers },
  );
  expect(workResponse.status()).toBe(200);
  const work = (await workResponse.json()) as {
    results: Array<{
      item: { id: string };
      result: {
        version: number;
        questions: Array<{ id: string; configuration: { type: string } }>;
        results: Array<{
          ruleId: string;
          outcome: string;
          resolutionClass?: string;
        }>;
      };
    }>;
  };
  for (const entry of work.results) {
    const answers: Record<string, string | number | boolean> = {};
    for (const question of entry.result.questions) {
      if (question.id === "q:qty.override.verified")
        answers[question.id] = true;
      else if (question.id === "q:qty.override.authorizedQty")
        answers[question.id] = 3;
      else if (question.id === "q:qty.override.code")
        answers[question.id] = "MANAGER_APPROVAL";
      else if (question.id === "q:qty.override.reason")
        answers[question.id] = "Synthetic browser authorization";
      else if (question.id === "q:qty.override.source")
        answers[question.id] = "browser-manager-42";
      else if (question.id === "q:check-count") answers[question.id] = true;
    }
    if (Object.keys(answers).length)
      expect(
        (
          await request.put(`${api}/phase3/items/${entry.item.id}/answers`, {
            headers: {
              ...headers,
              "idempotency-key": `browser-answer-${entry.item.id}`,
            },
            data: { answers },
          })
        ).status(),
      ).toBe(200);
  }
  const refreshed = (await (
    await request.get(`${api}/phase3/batches/${batchId}/work?limit=200`, {
      headers,
    })
  ).json()) as typeof work;
  const reviewerHeaders = {
    "x-development-user": "development-reviewer",
    "x-development-role": "reviewer",
  };
  let reviewed = 0;
  for (const entry of refreshed.results) {
    const ruleIds = entry.result.results
      .filter(
        (r) =>
          r.outcome === "VERIFY" && r.resolutionClass === "REVIEWER_RESOLVABLE",
      )
      .map((r) => r.ruleId);
    if (!ruleIds.length) continue;
    reviewed++;
    const response = await request.put(
      `${api}/phase3/items/${entry.item.id}/review`,
      {
        headers: {
          ...reviewerHeaders,
          "idempotency-key": `browser-review-${entry.item.id}`,
        },
        data: {
          status: "approved",
          reason: "Synthetic browser review",
          analysisVersion: entry.result.version,
          resolvedRuleIds: ruleIds,
          evidence: Object.fromEntries(
            ruleIds.map((id) => [
              id,
              "Compared with the synthetic source row.",
            ]),
          ),
        },
      },
    );
    expect(response.status()).toBe(200);
  }
  expect(reviewed).toBeGreaterThan(0);
  const exported = await request.post(
    `${api}/phase3/batches/${batchId}/export`,
    { headers: reviewerHeaders },
  );
  expect(exported.status()).toBe(200);
  expect(((await exported.json()) as { rowCount: number }).rowCount).toBe(4);
});
