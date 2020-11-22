import 'regenerator-runtime/runtime';
import { decodeImaAdpcm } from '..';

(async () => {
    const ctx = new AudioContext();

    const wavReq = await fetch('./A1_SSO.WAV');
    const wavBuffer = await wavReq.arrayBuffer();

    const audioBuffer = await decodeImaAdpcm(ctx, wavBuffer);

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    src.start(0);

    b.addEventListener('click', () => src.stop());
})();
