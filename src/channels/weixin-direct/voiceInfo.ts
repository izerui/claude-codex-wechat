/**
 * Voice format detection and duration calculation for outbound voice messages.
 * WeChat voice_item requires encode_type and playtime fields.
 */

export type VoiceInfo = {
  /** 1=pcm 2=adpcm 3=feature 4=speex 5=amr 6=silk 7=mp3 8=ogg-speex */
  encodeType: number;
  /** Duration in milliseconds. */
  playtime: number;
  /** Sample rate in Hz (optional). */
  sampleRate?: number;
};

function encodeTypeFromExt(ext: string): number {
  switch (ext.toLowerCase()) {
    case '.mp3': return 7;
    case '.amr': return 5;
    case '.silk': case '.slk': return 6;
    case '.wav': case '.pcm': return 1;
    case '.ogg': case '.opus': return 8;
    case '.spx': return 4;
    default: return 7;
  }
}

function estimatePlaytime(buf: Buffer, ext: string): number {
  switch (ext.toLowerCase()) {
    case '.wav': {
      if (buf.length < 44) return 1000;
      const byteRate = buf.readUInt32LE(28);
      if (byteRate === 0) return 1000;
      const dataSize = buf.length - 44;
      return Math.round((dataSize / byteRate) * 1000);
    }
    case '.mp3': {
      // Rough estimate assuming 128kbps
      return Math.round((buf.length * 8 / 128000) * 1000);
    }
    case '.amr': {
      // AMR-NB: 20ms per frame, ~32 bytes per frame, 6 byte header
      const frames = Math.floor((buf.length - 6) / 32);
      return frames * 20;
    }
    default:
      // Fallback: assume 16kbps
      return Math.round((buf.length * 8 / 16000) * 1000);
  }
}

export function detectVoiceInfo(buf: Buffer, fileName: string): VoiceInfo {
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop()! : '.mp3';
  return {
    encodeType: encodeTypeFromExt(ext),
    playtime: estimatePlaytime(buf, ext),
    sampleRate: ext === '.wav' && buf.length >= 28 ? buf.readUInt32LE(24) : undefined,
  };
}
