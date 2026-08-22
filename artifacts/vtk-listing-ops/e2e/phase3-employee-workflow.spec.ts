import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { importSixBitCsv } from "@workspace/domain/phase3";

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

  const quantityLabel = "Enter the specifically authorized QtyToList.";
  const quantitySection = page
    .getByLabel(quantityLabel)
    .locator("xpath=ancestor::section");
  await quantitySection
    .getByLabel("Is this QtyToList override authorized and verified?")
    .selectOption("true");
  await quantitySection.getByLabel(quantityLabel).fill("3");
  await quantitySection
    .getByLabel("Select the authorization evidence type.")
    .selectOption("MANAGER_APPROVAL");
  await quantitySection
    .getByLabel("Enter the authorization reason (8–500 characters).")
    .fill("Synthetic browser authorization");
  await quantitySection
    .getByLabel("Enter the evidence source or reference.")
    .fill("browser-manager-42");
  await quantitySection
    .getByLabel(
      "Verify Check Count for the displayed listed-inventory evidence.",
    )
    .selectOption("true");
  await quantitySection
    .getByRole("button", { name: "Save answers and revalidate" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Answers saved and deterministic rules revalidated.",
  );
  await page.reload();
  await expect(page.getByLabel(quantityLabel)).toHaveCount(0);

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
  const exportResult = (await exported.json()) as {
    exportId: string;
    checksum: string;
    rowCount: number;
    content: string;
    fieldDiffs: Array<{ field: string }>;
  };
  expect(exportResult.rowCount).toBe(4);
  const reparsed = importSixBitCsv(exportResult.content);
  expect(reparsed.rows).toHaveLength(4);
  expect(reparsed.rows[2].original.UnknownPassThrough).toBe("keep-three");
  expect(reparsed.rows[3].original.UnknownPassThrough).toBe(
    "=preserve-literal",
  );
  expect(
    exportResult.fieldDiffs.every((diff) =>
      ["Title", "eBay Description", "R2Code", "Check Count"].includes(
        diff.field,
      ),
    ),
  ).toBe(true);
  const provenance = await pool.query<{
    action: string;
    metadata: Record<string, unknown>;
  }>(
    "select action,metadata from audit_events where batch_id=$1 and action='listing_exported'",
    [batchId],
  );
  expect(provenance.rowCount).toBe(1);
  expect(provenance.rows[0].metadata.exportId).toBe(exportResult.exportId);
  expect(provenance.rows[0].metadata.checksum).toBe(exportResult.checksum);
  const replay = await request.post(`${api}/phase3/batches/${batchId}/export`, {
    headers: reviewerHeaders,
  });
  expect(replay.status()).toBe(200);
  expect(
    (
      await pool.query(
        "select 1 from audit_events where batch_id=$1 and action='listing_exported'",
        [batchId],
      )
    ).rowCount,
  ).toBe(1);
  const originals = await pool.query<{
    original_values: Record<string, string>;
  }>(
    "select original_values from listing_items where batch_id=$1 order by source_row_number",
    [batchId],
  );
  expect(originals.rows.map((row) => row.original_values.StockTotal)).toEqual([
    "2",
    "1",
    "1",
    "2",
  ]);
  expect(
    await readFile(
      new URL("../../../fixtures/phase3-sixbit-v1.csv", import.meta.url),
      "utf8",
    ),
  ).not.toContain("NEW Synthetic Reviewer Title");
});
