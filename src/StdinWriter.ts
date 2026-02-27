import type * as pty from 'node-pty';

export class StdinWriter {
  readonly #pty: pty.IPty;
  #dead = false;

  constructor(ptyProcess: pty.IPty) {
    this.#pty = ptyProcess;
  }

  write(data: string): void {
    if (this.#dead) return;
    try {
      this.#pty.write(data);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EPIPE') {
        process.stderr.write(`[StdinWriter] write error: ${code ?? String(err)}\n`);
      }
      // EPIPE = PTY process exited between dead-check and write — silently ignore
    }
  }

  markDead(): void {
    this.#dead = true;
  }

  get isDead(): boolean {
    return this.#dead;
  }
}
