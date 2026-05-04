import { createHash } from 'node:crypto';
import { type IncomingMessage } from 'node:http';
import { Socket } from 'node:net';

export type WsMessageHandler = (data: any, peer: MiniWebSocket) => void;

const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class MiniWebSocket {
  socket: Socket;
  buffer = Buffer.alloc(0);
  onMessage?: WsMessageHandler;
  onClose?: () => void;

  constructor(socket: Socket) {
    this.socket = socket;
    socket.on('data', (chunk) => this.read(chunk));
    socket.on('close', () => this.onClose?.());
    socket.on('error', () => this.onClose?.());
  }

  send(data: any) {
    this.socket.write(encodeFrame(JSON.stringify(data)));
  }

  close() {
    this.socket.end();
  }

  private read(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const parsed = tryDecodeFrame(this.buffer);
      if (!parsed) return;
      this.buffer = this.buffer.slice(parsed.bytes);
      if (parsed.opcode === 8) return this.close();
      if (parsed.opcode === 1) this.onMessage?.(JSON.parse(parsed.text), this);
    }
  }
}

export function acceptWebSocket(req: IncomingMessage, socket: Socket): MiniWebSocket | undefined {
  const key = req.headers['sec-websocket-key'];
  if (!key || Array.isArray(key)) return undefined;
  const accept = createHash('sha1').update(key + MAGIC).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    ''
  ].join('\r\n'));
  return new MiniWebSocket(socket);
}

function encodeFrame(text: string): Buffer {
  const payload = Buffer.from(text);
  const len = payload.length;
  let header: Buffer;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function tryDecodeFrame(buffer: Buffer): undefined | { bytes: number; text: string; opcode: number } {
  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let len = second & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buffer.length < 4) return undefined;
    len = buffer.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buffer.length < 10) return undefined;
    len = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  const maskOffset = offset;
  if (masked) offset += 4;
  if (buffer.length < offset + len) return undefined;
  let payload = buffer.slice(offset, offset + len);
  if (masked) {
    const mask = buffer.slice(maskOffset, maskOffset + 4);
    payload = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
  }
  return { bytes: offset + len, text: payload.toString('utf8'), opcode };
}
