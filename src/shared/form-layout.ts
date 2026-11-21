import type { PagePresentation } from "@/shared/contracts/page";

// Step IDs are stable: reordering or renaming must not change a saved session's step.
export function formLayout(sourceFields: readonly { name: string }[], presentation: PagePresentation | null) {
  const steps = presentation?.steps?.length ? presentation.steps : [{ id: 1, title: "" }];
  const names = new Set(sourceFields.map(field => field.name));
  const configured = (presentation?.fields ?? []).filter(field => names.has(field.name));
  const known = new Set(configured.map(field => field.name));
  const lastStep = steps[steps.length - 1].id;
  const fields: Array<NonNullable<PagePresentation["fields"]>[number] & { step: number; order: number }> = [
    ...configured.map((field, index) => ({ ...field, step: steps.some(step => step.id === (field.step ?? steps[0].id)) ? field.step ?? steps[0].id : steps[0].id, order: field.order ?? index })),
    ...sourceFields.filter(field => !known.has(field.name)).map((field, index) => ({ name: field.name, step: lastStep, order: 100 + index })),
  ].sort((a, b) => steps.findIndex(step => step.id === a.step) - steps.findIndex(step => step.id === b.step) || a.order - b.order);
  return { steps, fields: fields.map((field, order) => ({ ...field, order })) };
}
