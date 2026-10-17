import type { Engine } from './engine';

/** Render frames [from, to) and stream raw RGBA (bottom-up) to a WebSocket, one ack per frame. */
export async function stream(engine: Engine, from: number, to: number, url: string) {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let ackResolve: (() => void) | null = null;
  ws.onmessage = () => ackResolve?.();
  const buf = new Uint8Array(4 + engine.PW * engine.PH * 4);
  const view = new DataView(buf.buffer);
  for (let i = from; i < to; i++) {
    const target = await engine.renderFrame(i);
    engine.readPixels(target, buf.subarray(4));
    view.setInt32(0, i, true);
    const acked = new Promise<void>((r) => (ackResolve = r));
    ws.send(buf);
    await acked;
  }
  ws.close();
}
