/**
 * "1 mark", "3 marks", "0 marks". Counts shown to students read as English
 * (thirty-first pass: the 360px walkthrough saw "1 marks" and "1 open marks").
 */
export function countLabel(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "1 mark" / "2 marks"; `qualifier` goes between, e.g. "1 open mark". */
export function marksLabel(count: number, qualifier = ""): string {
  const prefix = qualifier ? `${qualifier} ` : "";
  return countLabel(count, `${prefix}mark`, `${prefix}marks`);
}
