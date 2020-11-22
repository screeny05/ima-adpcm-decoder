const fs = require('fs');
const loader = require('@assemblyscript/loader');
const memory = new WebAssembly.Memory({ initial: 8000, shared: true });
const imports = {};//{ env: { memory: memory } };
const wasmModule = loader.instantiateSync(fs.readFileSync(__dirname + "/../../dist/untouched.wasm"), imports);
module.exports = wasmModule.exports;
const { __retain, __release, __newArray, __getArray, __getArrayView } = wasmModule.exports;
console.log(wasmModule.exports.Int32Array_ID)
const data = [0, 1, 2, 3, 4, 5, 6, 7];
const arrayPtr = __retain(__newArray(wasmModule.exports.Uint8Array_ID, data));

console.log(
    arrayPtr,
    __getArray(arrayPtr),
    wasmModule.exports.decode(arrayPtr, 0, 2)
);
