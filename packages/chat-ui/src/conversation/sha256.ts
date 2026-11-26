/**
 * SHA-256 строки (UTF-8) — глобальный `crypto.subtle`: hex (64 знака) —
 * отпечаток показанного и ключ следа в истории; байты — код ссылки на экран
 * (`LinkCodes`).
 */
export class Sha256 {
  private constructor(private readonly text: string) {}

  static async hex(text: string): Promise<string> {
    const hash = await new Sha256(text).digest();
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  /** 32 байта дайджеста. */
  static async bytes(text: string): Promise<Uint8Array> {
    return new Sha256(text).digest();
  }

  private async digest(): Promise<Uint8Array> {
    const bytes = new TextEncoder().encode(this.text);
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  }
}
