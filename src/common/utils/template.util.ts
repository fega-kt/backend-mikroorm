/** Thay thế {{VARIABLE}} trong HTML template bằng giá trị thực */
export function renderTemplate(html: string, variables: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}
