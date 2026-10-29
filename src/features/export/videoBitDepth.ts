import type { InputVideoTrack } from 'mediabunny';

/** Read the stream's declared precision rather than inferring it from the file extension. */
export async function readVideoBitDepth(track: InputVideoTrack): Promise<number | null> {
  const codec = await track.getCodec();
  const config = await track.getDecoderConfig();
  const codecString = await track.getCodecParameterString();
  // Mediabunny derives VP9 / AV1 parameters from the encoded sequence header.
  if ((codec === 'vp9' || codec === 'av1') && codecString) {
    const depth = Number(codecString.split('.')[3]);
    if ([8, 10, 12].includes(depth)) return depth;
  }
  if (codec === 'hevc' && config?.description) {
    const description = config.description;
    const bytes = ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : new Uint8Array(description);
    // ISO/IEC 14496-15 hvcC: bitDepthLumaMinus8 and bitDepthChromaMinus8.
    if (bytes.length >= 23 && bytes[0] === 1) {
      const luma = 8 + (bytes[17]! & 7);
      const chroma = 8 + (bytes[18]! & 7);
      if (luma === chroma) return luma;
    }
  }
  return null;
}
