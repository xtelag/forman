const formulaPrefix = /^[=+\-@]/;

export function safeCsvCell(value: string) {
  return formulaPrefix.test(value) ? `'${value}` : value;
}
