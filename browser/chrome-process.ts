import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActivePort } from './active-port';

/** Префикс каталога профиля: по нему находят осиротевшие профили. */
const PROFILE_PREFIX = 'dmg-ui-chrome-';
/** Шаг опроса файла `DevToolsActivePort`, мс. */
const POLL_MS = 25;
/** Сколько ждать запись `DevToolsActivePort` после старта Chrome, мс. */
const START_TIMEOUT_MS = 15_000;
/** Сколько ждать выход Chrome после `SIGTERM`, прежде чем убить, мс. */
const EXIT_TIMEOUT_MS = 5_000;

/** Процесс Chrome без окна, со своим одноразовым профилем и портом отладки, выбранным системой. */
export class ChromeProcess {
  private closing: Promise<void> | undefined;

  private constructor(
    private readonly process: Bun.Subprocess,
    /** Каталог профиля: создан при запуске, удаляется в `close()`. */
    readonly profileDir: string,
    /** Адрес WebSocket браузера для протокола DevTools. */
    readonly endpoint: string,
  ) {}

  /**
   * Запускает Chrome и ждёт, пока он запишет `DevToolsActivePort`. Не успел за
   * 15 с или завершился сам — бросок; процесс и профиль при этом убираются.
   */
  static async launch(binary: string): Promise<ChromeProcess> {
    const profileDir = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
    const process = Bun.spawn(
      [
        binary,
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        `--user-data-dir=${profileDir}`,
        '--remote-debugging-port=0',
        'about:blank',
      ],
      {
        detached: true,
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
      },
    );
    try {
      const endpoint = await ChromeProcess.awaitEndpoint(process, profileDir);
      return new ChromeProcess(process, profileDir, endpoint);
    } catch (error) {
      await ChromeProcess.terminate(process, profileDir);
      throw error;
    }
  }

  /** Номер процесса Chrome. */
  get pid(): number {
    return this.process.pid;
  }

  /** Завершает Chrome (после ожидания — принудительно) и удаляет профиль; повторный вызов ждёт то же завершение. */
  close(): Promise<void> {
    this.closing ??= this.shutdown();
    return this.closing;
  }

  private shutdown(): Promise<void> {
    return ChromeProcess.terminate(this.process, this.profileDir);
  }

  /**
   * Просит Chrome выйти (`SIGTERM`), после срока — убивает; затем добивает
   * оставшиеся процессы его группы (дочерние живут дольше главного и могут
   * дописать профиль) и удаляет профиль.
   */
  private static async terminate(
    process: Bun.Subprocess,
    profileDir: string,
  ): Promise<void> {
    process.kill('SIGTERM');
    const exited = await Promise.race([
      process.exited.then(() => true),
      Bun.sleep(EXIT_TIMEOUT_MS).then(() => false),
    ]);
    if (!exited) process.kill('SIGKILL');
    await process.exited;
    ChromeProcess.killGroup(process.pid);
    ChromeProcess.removeProfile(profileDir);
  }

  /** Группа процессов Chrome (`detached` делает его главой группы): `SIGKILL` всем; нет такой группы — уже чисто. */
  private static killGroup(pid: number): void {
    try {
      globalThis.process.kill(-pid, 'SIGKILL');
    } catch {
      // Группы нет: все процессы Chrome уже вышли.
    }
  }

  /** Опрос файла `DevToolsActivePort` профиля: чтение файла, а не таймер теста. */
  private static async awaitEndpoint(
    process: Bun.Subprocess,
    profileDir: string,
  ): Promise<string> {
    const file = join(profileDir, 'DevToolsActivePort');
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (process.exitCode !== null) {
        throw new Error(
          `Chrome завершился при запуске с кодом ${process.exitCode}`,
        );
      }
      const info = ChromeProcess.read(file);
      if (info !== undefined) {
        return `ws://127.0.0.1:${info.port}${info.path}`;
      }
      await Bun.sleep(POLL_MS);
    }
    throw new Error(
      `Chrome не записал DevToolsActivePort за ${START_TIMEOUT_MS / 1000} с`,
    );
  }

  private static read(file: string) {
    try {
      return ActivePort.parse(readFileSync(file, 'utf8'));
    } catch {
      return undefined;
    }
  }

  /** Chrome мог ещё дописывать профиль: удаление повторяется. */
  private static removeProfile(profileDir: string): void {
    rmSync(profileDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50,
    });
  }
}
