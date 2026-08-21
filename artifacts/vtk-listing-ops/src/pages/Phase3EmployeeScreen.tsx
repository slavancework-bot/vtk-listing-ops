import { useEffect, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { loadPhase3Work, savePhase3Answers, type Phase3Result, type ServerItem } from "../data/serverApi";

type WorkItem = { item: ServerItem; result: Phase3Result };

export default function Phase3EmployeeScreen() {
  const batchId = new URLSearchParams(window.location.search).get("batchId");
  const [items, setItems] = useState<WorkItem[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [message, setMessage] = useState("Loading generated questions…");

  useEffect(() => {
    if (!batchId) { setMessage("A Phase 3 batchId is required."); return; }
    loadPhase3Work(batchId).then(({ results }) => {
      setItems(results);
      const restored: Record<string, string | boolean> = {};
      for (const { result } of results) for (const question of result.questions) {
        const saved = question.answer?.value;
        if (typeof saved === "string" || typeof saved === "boolean") restored[`${result.itemId}:${question.id}`] = saved;
      }
      setValues(restored);
      setMessage(results.some(({ result }) => result.questions.length) ? "" : "No employee questions remain for this batch.");
    }).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load Phase 3 work."));
  }, [batchId]);

  async function submit(work: WorkItem) {
    const answers: Record<string, string | boolean> = {};
    for (const question of work.result.questions) {
      const value = values[`${work.result.itemId}:${question.id}`];
      if (value !== undefined && value !== "") answers[question.id] = value;
    }
    if (Object.keys(answers).length === 0) { setMessage("Answer at least one generated question before saving."); return; }
    setMessage("Saving and revalidating…");
    try {
      await savePhase3Answers(work.result.itemId, answers, crypto.randomUUID());
      const refreshed = await loadPhase3Work(batchId!);
      setItems(refreshed.results);
      setMessage("Answers saved and deterministic rules revalidated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save answers."); }
  }

  return <div className="min-h-screen bg-slate-50">
    <AppHeader />
    <main className="mx-auto max-w-5xl p-6" data-testid="phase3-employee-work-screen">
      <h1 className="text-2xl font-bold">Phase 3 Employee Work Screen</h1>
      <p className="mt-1 text-sm text-slate-600">Only deterministic questions generated from the imported SixBit row are shown.</p>
      {message && <div role="status" className="my-4 rounded border bg-white p-3">{message}</div>}
      <div className="mt-5 space-y-5">
        {items.filter(({ result }) => result.questions.length > 0).map((work) => <section key={work.result.itemId} className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">SKU: {work.item.sku}</h2>
          <p className="mb-4 text-sm text-slate-600">{String(work.result.normalizedValues.title ?? "Untitled listing")}</p>
          <div className="space-y-4">
            {work.result.questions.map((question) => {
              const config = question.configuration;
              const key = `${work.result.itemId}:${question.id}`;
              return <label key={question.id} className="block text-sm font-medium">
                {config.label}
                {config.type === "boolean" ? <select aria-label={config.label} className="mt-1 block w-full rounded border p-2" value={String(values[key] ?? "")} onChange={(event) => setValues((old) => ({...old,[key]:event.target.value === "true"}))}>
                  <option value="">Choose…</option><option value="true">Yes</option><option value="false">No</option>
                </select> : <Input className="mt-1" aria-label={config.label} value={String(values[key] ?? "")} onChange={(event) => setValues((old) => ({...old,[key]:event.target.value}))} />}
              </label>;
            })}
          </div>
          <Button className="mt-4" onClick={() => void submit(work)}>Save answers and revalidate</Button>
        </section>)}
      </div>
    </main>
  </div>;
}
