export function isOptOut(text: string): boolean {
  return /\b(stop|unsubscribe|cancel\s*msgs|opt\s*out)\b/i.test(text || '');
}
export function first(name?: string): string {
  return (name || 'there').split(' ')[0] || 'there';
}
