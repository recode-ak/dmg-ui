/** SHA-256 строки в hex (64 знака) — глобальный `crypto.subtle`: отпечаток показанного и ключ следа в истории. */
export class Sha256 {
  private constructor(private readonly text: string) {}

  static async hex(text: string): Promise<string> {
    return new Sha256(text).digest();
  }

  private async digest(): Promise<string> {
    const bytes = new TextEncoder().encode(this.text);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }
}
