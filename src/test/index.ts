import 'regenerator-runtime/runtime';
import { AdpcmDecoder } from '..';

const bufferToCanvas = (el: HTMLCanvasElement, buffer: Float32Array): void => {
    const size = Math.ceil(Math.sqrt(buffer.length));
    const ctx = el.getContext('2d')!;
    el.width=size;
    el.height=size;

    buffer.forEach((v, i) => {
        const shade = v * 255;
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
        ctx.fillRect(i % size, Math.floor(i / size), 1, 1);
    });
};

const decodeTest = (ctx: AudioContext, wavBuffer: ArrayBuffer, decoder: AdpcmDecoder, js: boolean = false) => {
    const start = performance.now();
    const buffer = decoder.decodeImaAdpcm(ctx, wavBuffer, js);
    console.log(js ? 'JS:' : 'WASM:', performance.now() - start);
    return buffer;
}

(async () => {
    const ctx = new AudioContext();

    const wavReq = await fetch('./multi.WAV');
    const wavBuffer = await wavReq.arrayBuffer();

    const decoder = new AdpcmDecoder();
    await decoder.initWasm();

    const audioBuffer = decodeTest(ctx, wavBuffer, decoder);

    const wasmData = new Float32Array(audioBuffer.getChannelData(0));
    const jsData = new Float32Array(decodeTest(ctx, wavBuffer, decoder, true).getChannelData(0));

    let diffCount = 0;
    wasmData.forEach((val, i) => {
        const diff = Math.abs(val - jsData[i]);
        const threshold = 0.00000000001;
        if(diff > threshold){
            diffCount++;
            //console.log('diff in', i, diff, '=>', val, jsData[i])
        }
    });

    console.log('total diffs', diffCount, `${Math.round(diffCount / jsData.length * 100)}%`);

    //bufferToCanvas(a, wasmData);
    //bufferToCanvas(c, jsData);

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    src.start(0);

    b.addEventListener('click', () => src.stop());
})();
